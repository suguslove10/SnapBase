package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	razorpay "github.com/razorpay/razorpay-go"

	"github.com/suguslove10/snapbase/config"
)

type BillingHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

// PlanCatalog is the single source of truth for what each plan costs and includes.
// Update this and the frontend pricing copy together.
type PlanSpec struct {
	Key            string
	Period         string // "monthly" | "annual"
	AmountCents    int    // shown to users (e.g. 900 = $9.00)
	StorageBytes   int64
	ConnectionsMax int  // -1 = unlimited
	RetentionDays  int
	TeamSeats      int
}

const (
	gb = int64(1024 * 1024 * 1024)
)

// Catalog is keyed by "plan:period" (e.g. "pro:monthly", "team:annual").
// Annual saves 17% (10x monthly = 2 months free).
var Catalog = map[string]PlanSpec{
	"free:monthly":     {Key: "free", Period: "monthly", AmountCents: 0, StorageBytes: 1 * gb, ConnectionsMax: 2, RetentionDays: 7, TeamSeats: 1},
	"pro:monthly":      {Key: "pro", Period: "monthly", AmountCents: 900, StorageBytes: 10 * gb, ConnectionsMax: 5, RetentionDays: 30, TeamSeats: 1},
	"pro:annual":       {Key: "pro", Period: "annual", AmountCents: 9000, StorageBytes: 10 * gb, ConnectionsMax: 5, RetentionDays: 30, TeamSeats: 1},
	"team:monthly":     {Key: "team", Period: "monthly", AmountCents: 4900, StorageBytes: 100 * gb, ConnectionsMax: -1, RetentionDays: 90, TeamSeats: 5},
	"team:annual":      {Key: "team", Period: "annual", AmountCents: 49000, StorageBytes: 100 * gb, ConnectionsMax: -1, RetentionDays: 90, TeamSeats: 5},
	"business:monthly": {Key: "business", Period: "monthly", AmountCents: 14900, StorageBytes: 500 * gb, ConnectionsMax: -1, RetentionDays: 365, TeamSeats: 25},
	"business:annual":  {Key: "business", Period: "annual", AmountCents: 149000, StorageBytes: 500 * gb, ConnectionsMax: -1, RetentionDays: 365, TeamSeats: 25},
}

// getUserPlan returns the effective plan key for a user.
// Honours trial (returns paid plan during trial), expiry (returns free after period_end without renewal),
// and cancellation states. Defaults to 'free' if no row.
func getUserPlan(db *sql.DB, userID int) string {
	var plan, status string
	var trialEndsAt, periodEnd sql.NullTime
	var cancelAtPeriodEnd bool
	err := db.QueryRow(
		`SELECT plan, status, trial_ends_at, current_period_end, COALESCE(cancel_at_period_end, false)
		 FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
		userID,
	).Scan(&plan, &status, &trialEndsAt, &periodEnd, &cancelAtPeriodEnd)
	if err != nil {
		return "free"
	}

	switch status {
	case "trialing":
		// Active trial: grant the paid plan until trial_ends_at.
		if trialEndsAt.Valid && time.Now().Before(trialEndsAt.Time) {
			return plan
		}
		// Trial expired → fall through to free.
		return "free"
	case "active":
		// If cancelled-at-period-end, still active until period_end then free.
		if cancelAtPeriodEnd && periodEnd.Valid && time.Now().After(periodEnd.Time) {
			return "free"
		}
		// Past period_end without renewal → treat as free (webhook should mark this anyway).
		if periodEnd.Valid && time.Now().After(periodEnd.Time.Add(48*time.Hour)) {
			return "free"
		}
		return plan
	case "halted", "cancelled", "completed", "expired":
		return "free"
	}
	return plan
}

// GetStorageUsed returns total backup bytes used by a user.
func GetStorageUsed(db *sql.DB, userID int) int64 {
	var used int64
	db.QueryRow(`
		SELECT COALESCE(SUM(b.size_bytes), 0) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.status = 'success'
	`, userID).Scan(&used)
	return used
}

// GetStorageLimit returns the storage limit in bytes for a given plan, including any active add-on packs.
func GetStorageLimit(plan string) int64 {
	switch plan {
	case "pro":
		return 10 * gb
	case "team":
		return 100 * gb
	case "business":
		return 500 * gb
	case "enterprise":
		return 1000 * gb
	default:
		return 1 * gb
	}
}

// GetStorageLimitWithAddons returns the plan limit plus any active storage add-on packs.
func GetStorageLimitWithAddons(db *sql.DB, userID int, plan string) int64 {
	base := GetStorageLimit(plan)
	var bonusGB int
	db.QueryRow(
		"SELECT COALESCE(SUM(pack_size_gb), 0) FROM storage_addons WHERE user_id = $1 AND status = 'active'",
		userID,
	).Scan(&bonusGB)
	return base + (int64(bonusGB) * gb)
}

// seedFreeSubscription inserts a 14-day Pro trial for a newly created user.
// After trial expiry, getUserPlan returns 'free'.
func seedFreeSubscription(db *sql.DB, userID int) {
	trialEnds := time.Now().AddDate(0, 0, 14)
	db.Exec(`
		INSERT INTO subscriptions (user_id, plan, status, trial_started_at, trial_ends_at, billing_period)
		VALUES ($1, 'pro', 'trialing', NOW(), $2, 'monthly')
		ON CONFLICT (user_id) DO NOTHING
	`, userID, trialEnds)
}

// resolvePlanID returns the Razorpay plan_id for a (plan, period) combo, or "" if unconfigured.
func (h *BillingHandler) resolvePlanID(plan, period string) string {
	switch plan + ":" + period {
	case "pro:monthly":
		return h.Cfg.RazorpayPlanProMonthly
	case "pro:annual":
		return h.Cfg.RazorpayPlanProAnnual
	case "team:monthly":
		return h.Cfg.RazorpayPlanTeamMonthly
	case "team:annual":
		return h.Cfg.RazorpayPlanTeamAnnual
	case "business:monthly":
		return h.Cfg.RazorpayPlanBusinessMonthly
	case "business:annual":
		return h.Cfg.RazorpayPlanBusinessAnnual
	}
	return ""
}

// GetSubscription returns the current user's subscription info — used by /billing page.
func (h *BillingHandler) GetSubscription(c *gin.Context) {
	userID := c.GetInt("user_id")

	var plan, status string
	var period sql.NullString
	var trialEndsAt, currentPeriodEnd sql.NullTime
	var cancelAtPeriodEnd bool
	var amountCents sql.NullInt64

	err := h.DB.QueryRow(`
		SELECT plan, status, billing_period, trial_ends_at, current_period_end,
		       COALESCE(cancel_at_period_end, false), billing_amount_cents
		FROM subscriptions WHERE user_id = $1
		ORDER BY id DESC LIMIT 1
	`, userID).Scan(&plan, &status, &period, &trialEndsAt, &currentPeriodEnd, &cancelAtPeriodEnd, &amountCents)

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"plan":                 "free",
			"status":               "active",
			"period":               "monthly",
			"trial_ends_at":        nil,
			"current_period_end":   nil,
			"cancel_at_period_end": false,
			"effective_plan":       "free",
		})
		return
	}

	resp := gin.H{
		"plan":                 plan,
		"status":               status,
		"period":               period.String,
		"cancel_at_period_end": cancelAtPeriodEnd,
		"amount_cents":         amountCents.Int64,
		"effective_plan":       getUserPlan(h.DB, userID),
	}
	if trialEndsAt.Valid {
		resp["trial_ends_at"] = trialEndsAt.Time
		resp["trial_days_left"] = int(time.Until(trialEndsAt.Time).Hours() / 24)
	} else {
		resp["trial_ends_at"] = nil
	}
	if currentPeriodEnd.Valid {
		resp["current_period_end"] = currentPeriodEnd.Time
	} else {
		resp["current_period_end"] = nil
	}
	c.JSON(http.StatusOK, resp)
}

// Checkout creates a Razorpay subscription and returns subscription_id for frontend checkout.
// This is the new recurring-billing entry point. Replaces the old one-time-order CreateOrder.
func (h *BillingHandler) Checkout(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Plan   string `json:"plan" binding:"required"`
		Period string `json:"period"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan is required"})
		return
	}

	plan := strings.ToLower(req.Plan)
	period := strings.ToLower(req.Period)
	if period == "" {
		period = "monthly"
	}
	if period != "monthly" && period != "annual" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "period must be 'monthly' or 'annual'"})
		return
	}
	if plan != "pro" && plan != "team" && plan != "business" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan must be 'pro', 'team' or 'business'"})
		return
	}

	planID := h.resolvePlanID(plan, period)
	if planID == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": fmt.Sprintf("Razorpay plan for %s/%s is not configured. Set RAZORPAY_PLAN_%s_%s.",
				plan, period, strings.ToUpper(plan), strings.ToUpper(period)),
		})
		return
	}

	spec, ok := Catalog[plan+":"+period]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown plan"})
		return
	}

	client := razorpay.NewClient(h.Cfg.RazorpayKeyID, h.Cfg.RazorpayKeySecret)

	// total_count: number of billing cycles. 12 for monthly = 1 year, 5 for annual = 5 years.
	// Razorpay requires total_count; users can cancel anytime.
	totalCount := 12
	if period == "annual" {
		totalCount = 5
	}

	subData := map[string]interface{}{
		"plan_id":         planID,
		"total_count":     totalCount,
		"customer_notify": 1,
		"notes": map[string]interface{}{
			"user_id": fmt.Sprintf("%d", userID),
			"plan":    plan,
			"period":  period,
		},
	}

	sub, err := client.Subscription.Create(subData, nil)
	if err != nil {
		log.Printf("[billing] Razorpay subscription.create failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create subscription"})
		return
	}

	subID, _ := sub["id"].(string)
	if subID == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Razorpay returned no subscription id"})
		return
	}

	// Pre-stage local row in 'created' state. Webhook + Verify will move to 'active'.
	h.DB.Exec(`
		INSERT INTO subscriptions (user_id, plan, status, billing_period, billing_amount_cents, razorpay_subscription_id, updated_at)
		VALUES ($1, $2, 'created', $3, $4, $5, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET plan = $2, status = 'created', billing_period = $3, billing_amount_cents = $4,
		    razorpay_subscription_id = $5, cancel_at_period_end = false, updated_at = NOW()
	`, userID, plan, period, spec.AmountCents, subID)

	c.JSON(http.StatusOK, gin.H{
		"subscription_id": subID,
		"plan":            plan,
		"period":          period,
		"amount_cents":    spec.AmountCents,
		"key_id":          h.Cfg.RazorpayKeyID,
	})
}

// VerifyPayment verifies the Razorpay subscription signature after the customer completes checkout.
// For subscriptions, signature is HMAC-SHA256 of "payment_id|subscription_id".
func (h *BillingHandler) VerifyPayment(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		RazorpayPaymentID      string `json:"razorpay_payment_id" binding:"required"`
		RazorpaySubscriptionID string `json:"razorpay_subscription_id" binding:"required"`
		RazorpaySignature      string `json:"razorpay_signature" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing payment fields"})
		return
	}

	mac := hmac.New(sha256.New, []byte(h.Cfg.RazorpayKeySecret))
	mac.Write([]byte(req.RazorpayPaymentID + "|" + req.RazorpaySubscriptionID))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedSig), []byte(req.RazorpaySignature)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payment signature"})
		return
	}

	// Look up plan/period from the staged row, ensure it matches the subscription_id we issued.
	var plan, period string
	var amountCents int
	err := h.DB.QueryRow(`
		SELECT plan, COALESCE(billing_period, 'monthly'), COALESCE(billing_amount_cents, 0)
		FROM subscriptions WHERE user_id = $1 AND razorpay_subscription_id = $2
	`, userID, req.RazorpaySubscriptionID).Scan(&plan, &period, &amountCents)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subscription not found for this user"})
		return
	}

	// Compute period end based on billing period.
	periodEnd := time.Now().AddDate(0, 1, 0)
	if period == "annual" {
		periodEnd = time.Now().AddDate(1, 0, 0)
	}

	h.DB.Exec(`
		UPDATE subscriptions
		SET status = 'active', current_period_end = $1, cancel_at_period_end = false, updated_at = NOW()
		WHERE user_id = $2 AND razorpay_subscription_id = $3
	`, periodEnd, userID, req.RazorpaySubscriptionID)

	// Record invoice locally for billing history.
	h.DB.Exec(`
		INSERT INTO invoices (user_id, razorpay_payment_id, razorpay_subscription_id, amount_cents, currency, status, description, paid_at)
		VALUES ($1, $2, $3, $4, 'USD', 'paid', $5, NOW())
	`, userID, req.RazorpayPaymentID, req.RazorpaySubscriptionID, amountCents,
		fmt.Sprintf("SnapBase %s — %s", strings.Title(plan), period))

	// Affiliate credit: 20% of payment goes to referrer (recurring for life).
	creditReferrer(h.DB, userID, amountCents)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// CancelSubscription cancels at period end — user keeps access until current_period_end.
func (h *BillingHandler) CancelSubscription(c *gin.Context) {
	userID := c.GetInt("user_id")

	var subID sql.NullString
	err := h.DB.QueryRow(
		"SELECT razorpay_subscription_id FROM subscriptions WHERE user_id = $1",
		userID,
	).Scan(&subID)
	if err != nil || !subID.Valid || subID.String == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No active paid subscription to cancel"})
		return
	}

	client := razorpay.NewClient(h.Cfg.RazorpayKeyID, h.Cfg.RazorpayKeySecret)

	// cancel_at_cycle_end=1 keeps the user active until period_end.
	_, err = client.Subscription.Cancel(subID.String, map[string]interface{}{
		"cancel_at_cycle_end": 1,
	}, nil)
	if err != nil {
		log.Printf("[billing] Razorpay subscription.cancel failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel with payment provider"})
		return
	}

	h.DB.Exec(
		"UPDATE subscriptions SET cancel_at_period_end = true, updated_at = NOW() WHERE user_id = $1",
		userID,
	)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Subscription will end at period close — you keep access until then."})
}

// ResumeSubscription un-cancels a subscription that was set to cancel-at-period-end.
// Note: Razorpay does not support un-cancelling once a cancel is queued, so this is local-only —
// for true resume, customer must re-checkout. We surface that constraint to the UI.
func (h *BillingHandler) ResumeSubscription(c *gin.Context) {
	userID := c.GetInt("user_id")
	res, err := h.DB.Exec(`
		UPDATE subscriptions SET cancel_at_period_end = false, updated_at = NOW()
		WHERE user_id = $1 AND status = 'active' AND cancel_at_period_end = true
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resume"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No cancelled subscription to resume. If your subscription has already ended, please re-subscribe."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ListInvoices returns paid invoices for the current user.
func (h *BillingHandler) ListInvoices(c *gin.Context) {
	userID := c.GetInt("user_id")
	rows, err := h.DB.Query(`
		SELECT id, COALESCE(razorpay_invoice_id, ''), COALESCE(razorpay_payment_id, ''),
		       amount_cents, currency, status, COALESCE(description, ''),
		       COALESCE(invoice_url, ''), paid_at, created_at
		FROM invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch invoices"})
		return
	}
	defer rows.Close()

	type Invoice struct {
		ID                int        `json:"id"`
		RazorpayInvoiceID string     `json:"razorpay_invoice_id"`
		RazorpayPaymentID string     `json:"razorpay_payment_id"`
		AmountCents       int        `json:"amount_cents"`
		Currency          string     `json:"currency"`
		Status            string     `json:"status"`
		Description       string     `json:"description"`
		InvoiceURL        string     `json:"invoice_url"`
		PaidAt            *time.Time `json:"paid_at"`
		CreatedAt         time.Time  `json:"created_at"`
	}
	out := []Invoice{}
	for rows.Next() {
		var inv Invoice
		var paidAt sql.NullTime
		if err := rows.Scan(&inv.ID, &inv.RazorpayInvoiceID, &inv.RazorpayPaymentID,
			&inv.AmountCents, &inv.Currency, &inv.Status, &inv.Description,
			&inv.InvoiceURL, &paidAt, &inv.CreatedAt); err != nil {
			continue
		}
		if paidAt.Valid {
			inv.PaidAt = &paidAt.Time
		}
		out = append(out, inv)
	}
	c.JSON(http.StatusOK, out)
}

// GetUsage returns storage and connection usage for the current org/user.
// Now respects storage add-on packs.
func (h *BillingHandler) GetUsage(c *gin.Context) {
	userID := c.GetInt("user_id")
	orgIDRaw, hasOrg := c.Get("org_id")
	plan := getUserPlan(h.DB, userID)

	var storageUsed int64
	if hasOrg {
		h.DB.QueryRow(`
			SELECT COALESCE(SUM(b.size_bytes), 0) FROM backup_jobs b
			JOIN db_connections dc ON b.connection_id = dc.id
			WHERE (dc.org_id = $1 OR (dc.org_id IS NULL AND dc.user_id = $2)) AND b.status = 'success'
		`, orgIDRaw, userID).Scan(&storageUsed)
	} else {
		h.DB.QueryRow(`
			SELECT COALESCE(SUM(b.size_bytes), 0) FROM backup_jobs b
			JOIN db_connections dc ON b.connection_id = dc.id
			WHERE dc.user_id = $1 AND b.status = 'success'
		`, userID).Scan(&storageUsed)
	}

	storageLimit := GetStorageLimitWithAddons(h.DB, userID, plan)
	storagePercentage := 0.0
	if storageLimit > 0 {
		storagePercentage = float64(storageUsed) / float64(storageLimit) * 100
	}

	var connectionsUsed int
	if hasOrg {
		h.DB.QueryRow(
			"SELECT COUNT(*) FROM db_connections WHERE org_id = $1 OR (org_id IS NULL AND user_id = $2)",
			orgIDRaw, userID,
		).Scan(&connectionsUsed)
	} else {
		h.DB.QueryRow("SELECT COUNT(*) FROM db_connections WHERE user_id = $1", userID).Scan(&connectionsUsed)
	}

	connectionsLimit := 2 // free
	switch plan {
	case "pro":
		connectionsLimit = 5
	case "team", "business", "enterprise":
		connectionsLimit = -1
	}

	// Surface overage if any (storage above plan, *before* counting add-ons).
	overageBytes := int64(0)
	overageCents := 0
	if storageUsed > GetStorageLimit(plan) {
		overageBytes = storageUsed - GetStorageLimit(plan)
		// $0.05 per GB-month, rounded up to nearest 0.1 GB
		overageGB := float64(overageBytes) / float64(gb)
		overageCents = int(overageGB*5 + 0.999)
	}

	c.JSON(http.StatusOK, gin.H{
		"storage_used_bytes":      storageUsed,
		"storage_used_formatted":  formatUsageBytes(storageUsed),
		"storage_limit_bytes":     storageLimit,
		"storage_limit_formatted": formatUsageBytes(storageLimit),
		"storage_percentage":      storagePercentage,
		"connections_used":        connectionsUsed,
		"connections_limit":       connectionsLimit,
		"plan":                    plan,
		"overage_bytes":           overageBytes,
		"overage_cents":           overageCents,
	})
}

func formatUsageBytes(b int64) string {
	if b == 0 {
		return "0 B"
	}
	const k = 1024
	sizes := []string{"B", "KB", "MB", "GB", "TB"}
	i := 0
	size := float64(b)
	for size >= float64(k) && i < len(sizes)-1 {
		size /= float64(k)
		i++
	}
	return fmt.Sprintf("%.2f %s", size, sizes[i])
}

// creditReferrer awards 20% of an invoice to the referring user (lifetime recurring).
func creditReferrer(db *sql.DB, payerID, amountCents int) {
	var referrerID sql.NullInt64
	db.QueryRow("SELECT referred_by FROM users WHERE id = $1", payerID).Scan(&referrerID)
	if !referrerID.Valid || referrerID.Int64 == 0 {
		return
	}
	commission := amountCents * 20 / 100
	if commission <= 0 {
		return
	}
	db.Exec(`
		INSERT INTO referral_credits (referrer_id, referred_user_id, amount_cents)
		VALUES ($1, $2, $3)
	`, referrerID.Int64, payerID, commission)
}

// Webhook handles Razorpay events. Signed with RAZORPAY_WEBHOOK_SECRET.
func (h *BillingHandler) Webhook(c *gin.Context) {
	body, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read body"})
		return
	}

	sig := c.GetHeader("X-Razorpay-Signature")
	webhookSecret := h.Cfg.RazorpayWebhookSecret
	if webhookSecret != "" && sig != "" {
		mac := hmac.New(sha256.New, []byte(webhookSecret))
		mac.Write(body)
		expected := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(sig), []byte(expected)) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}
	}

	var event struct {
		Event   string                 `json:"event"`
		Payload map[string]interface{} `json:"payload"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	switch event.Event {
	case "subscription.activated", "subscription.charged":
		h.handleSubscriptionRenewal(event.Payload)
	case "subscription.halted":
		h.handleSubscriptionUpdate(event.Payload, "halted")
	case "subscription.cancelled":
		h.handleSubscriptionUpdate(event.Payload, "cancelled")
	case "subscription.completed":
		h.handleSubscriptionUpdate(event.Payload, "completed")
	case "subscription.pending":
		h.handleSubscriptionUpdate(event.Payload, "pending")
	case "payment.captured":
		h.recordPaymentInvoice(event.Payload)
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

func (h *BillingHandler) handleSubscriptionRenewal(payload map[string]interface{}) {
	subEntity := extractEntity(payload, "subscription")
	if subEntity == nil {
		return
	}
	subID, _ := subEntity["id"].(string)
	if subID == "" {
		return
	}

	// Compute new period end from billing_period stored locally.
	var period string
	h.DB.QueryRow(
		"SELECT COALESCE(billing_period, 'monthly') FROM subscriptions WHERE razorpay_subscription_id = $1",
		subID,
	).Scan(&period)

	periodEnd := time.Now().AddDate(0, 1, 0)
	if period == "annual" {
		periodEnd = time.Now().AddDate(1, 0, 0)
	}

	h.DB.Exec(`
		UPDATE subscriptions
		SET status = 'active', current_period_end = $1, updated_at = NOW()
		WHERE razorpay_subscription_id = $2
	`, periodEnd, subID)

	// Record renewal invoice
	if pmtEntity := extractEntity(payload, "payment"); pmtEntity != nil {
		pmtID, _ := pmtEntity["id"].(string)
		amountAny, _ := pmtEntity["amount"].(float64)
		var userID, planAmount int
		var plan string
		h.DB.QueryRow(
			"SELECT user_id, plan, COALESCE(billing_amount_cents, 0) FROM subscriptions WHERE razorpay_subscription_id = $1",
			subID,
		).Scan(&userID, &plan, &planAmount)
		if userID > 0 {
			amount := int(amountAny)
			if amount == 0 {
				amount = planAmount
			}
			h.DB.Exec(`
				INSERT INTO invoices (user_id, razorpay_payment_id, razorpay_subscription_id, amount_cents, currency, status, description, paid_at)
				VALUES ($1, $2, $3, $4, 'USD', 'paid', $5, NOW())
			`, userID, pmtID, subID, amount, fmt.Sprintf("SnapBase %s renewal", strings.Title(plan)))
			creditReferrer(h.DB, userID, amount)
		}
	}
}

func (h *BillingHandler) handleSubscriptionUpdate(payload map[string]interface{}, newStatus string) {
	subEntity := extractEntity(payload, "subscription")
	if subEntity == nil {
		return
	}
	subID, _ := subEntity["id"].(string)
	if subID == "" {
		return
	}
	h.DB.Exec(
		"UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE razorpay_subscription_id = $2",
		newStatus, subID,
	)
}

func (h *BillingHandler) recordPaymentInvoice(payload map[string]interface{}) {
	pmtEntity := extractEntity(payload, "payment")
	if pmtEntity == nil {
		return
	}
	// Only record here if payment isn't tied to a subscription (one-off charges).
	if subID, ok := pmtEntity["subscription_id"].(string); ok && subID != "" {
		return
	}
}

// extractEntity safely walks payload[key]["entity"] which is Razorpay's standard envelope.
func extractEntity(payload map[string]interface{}, key string) map[string]interface{} {
	wrapper, ok := payload[key].(map[string]interface{})
	if !ok {
		return nil
	}
	entity, ok := wrapper["entity"].(map[string]interface{})
	if !ok {
		return nil
	}
	return entity
}

// StartTrial — explicit trial-start endpoint (in case user signed up before trial logic, or we want to extend).
// Currently auto-triggered at signup; this exists for manual extension by admin tools.
func (h *BillingHandler) StartTrial(c *gin.Context) {
	userID := c.GetInt("user_id")
	var existing string
	err := h.DB.QueryRow("SELECT status FROM subscriptions WHERE user_id = $1", userID).Scan(&existing)
	if err == nil && existing != "" && existing != "free" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Trial already used or subscription active"})
		return
	}
	trialEnds := time.Now().AddDate(0, 0, 14)
	h.DB.Exec(`
		INSERT INTO subscriptions (user_id, plan, status, trial_started_at, trial_ends_at, billing_period)
		VALUES ($1, 'pro', 'trialing', NOW(), $2, 'monthly')
		ON CONFLICT (user_id) DO UPDATE
		SET plan = 'pro', status = 'trialing', trial_started_at = NOW(), trial_ends_at = $2
	`, userID, trialEnds)
	c.JSON(http.StatusOK, gin.H{"success": true, "trial_ends_at": trialEnds})
}
