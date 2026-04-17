package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

// getUserPlan returns the plan for a user ('free', 'pro', or 'team').
// Defaults to 'free' if no subscription record exists.
func getUserPlan(db *sql.DB, userID int) string {
	var plan, status string
	err := db.QueryRow(
		"SELECT plan, status FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
		userID,
	).Scan(&plan, &status)
	if err != nil {
		return "free"
	}
	if status == "active" || status == "trialing" {
		return plan
	}
	return "free"
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

// GetStorageLimit returns the storage limit in bytes for a given plan.
func GetStorageLimit(plan string) int64 {
	switch plan {
	case "pro":
		return 10 * 1024 * 1024 * 1024 // 10 GB
	case "team", "enterprise":
		return 100 * 1024 * 1024 * 1024 // 100 GB
	default: // free
		return 1 * 1024 * 1024 * 1024 // 1 GB
	}
}

// seedFreeSubscription inserts a free subscription row for a newly created user.
func seedFreeSubscription(db *sql.DB, userID int) {
	db.Exec(
		"INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active') ON CONFLICT DO NOTHING",
		userID,
	)
}

// GetSubscription returns the current user's subscription info.
func (h *BillingHandler) GetSubscription(c *gin.Context) {
	userID := c.GetInt("user_id")

	var plan, status string
	var currentPeriodEnd sql.NullTime
	var cancelAtPeriodEnd bool

	err := h.DB.QueryRow(`
		SELECT plan, status, current_period_end, cancel_at_period_end
		FROM subscriptions WHERE user_id = $1
		ORDER BY id DESC LIMIT 1
	`, userID).Scan(&plan, &status, &currentPeriodEnd, &cancelAtPeriodEnd)

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"plan":                 "free",
			"status":               "active",
			"current_period_end":   nil,
			"cancel_at_period_end": false,
		})
		return
	}

	var periodEnd interface{}
	if currentPeriodEnd.Valid {
		periodEnd = currentPeriodEnd.Time
	}

	c.JSON(http.StatusOK, gin.H{
		"plan":                 plan,
		"status":               status,
		"current_period_end":   periodEnd,
		"cancel_at_period_end": cancelAtPeriodEnd,
	})
}

// CreateOrder creates a Razorpay order and returns order details to the frontend.
func (h *BillingHandler) CreateOrder(c *gin.Context) {
	var req struct {
		Plan string `json:"plan" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan is required (pro or team)"})
		return
	}

	var amount int
	switch strings.ToLower(req.Plan) {
	case "pro":
		amount = 900 // $9.00
	case "team":
		amount = 2900 // $29.00
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan must be 'pro' or 'team'"})
		return
	}

	client := razorpay.NewClient(h.Cfg.RazorpayKeyID, h.Cfg.RazorpayKeySecret)

	data := map[string]interface{}{
		"amount":   amount,
		"currency": "USD",
		"receipt":  fmt.Sprintf("rcpt_%d_%s", c.GetInt("user_id"), req.Plan),
	}

	order, err := client.Order.Create(data, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"order_id": order["id"],
		"amount":   order["amount"],
		"currency": order["currency"],
		"key_id":   h.Cfg.RazorpayKeyID,
	})
}

// VerifyPayment verifies Razorpay payment signature and upgrades user plan.
func (h *BillingHandler) VerifyPayment(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		RazorpayOrderID   string `json:"razorpay_order_id" binding:"required"`
		RazorpayPaymentID string `json:"razorpay_payment_id" binding:"required"`
		RazorpaySignature string `json:"razorpay_signature" binding:"required"`
		Plan              string `json:"plan" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing payment fields"})
		return
	}

	// Verify HMAC-SHA256 signature
	mac := hmac.New(sha256.New, []byte(h.Cfg.RazorpayKeySecret))
	mac.Write([]byte(req.RazorpayOrderID + "|" + req.RazorpayPaymentID))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedSig), []byte(req.RazorpaySignature)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payment signature"})
		return
	}

	plan := strings.ToLower(req.Plan)
	if plan != "pro" && plan != "team" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid plan"})
		return
	}

	periodEnd := time.Now().AddDate(0, 1, 0) // 30 days from now

	h.DB.Exec(`
		INSERT INTO subscriptions (user_id, plan, status, current_period_end, updated_at)
		VALUES ($1, $2, 'active', $3, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET plan = $2, status = 'active', current_period_end = $3, updated_at = NOW()
	`, userID, plan, periodEnd)

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetUsage returns storage and connection usage for the current org/user.
func (h *BillingHandler) GetUsage(c *gin.Context) {
	userID := c.GetInt("user_id")
	orgIDRaw, hasOrg := c.Get("org_id")
	plan := getUserPlan(h.DB, userID)

	// Storage used — org-aware
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

	storageLimit := GetStorageLimit(plan)
	storagePercentage := 0.0
	if storageLimit > 0 {
		storagePercentage = float64(storageUsed) / float64(storageLimit) * 100
	}

	// Connections used — org-aware
	var connectionsUsed int
	if hasOrg {
		h.DB.QueryRow(
			"SELECT COUNT(*) FROM db_connections WHERE org_id = $1 OR (org_id IS NULL AND user_id = $2)",
			orgIDRaw, userID,
		).Scan(&connectionsUsed)
	} else {
		h.DB.QueryRow("SELECT COUNT(*) FROM db_connections WHERE user_id = $1", userID).Scan(&connectionsUsed)
	}

	connectionsLimit := 1
	switch plan {
	case "pro":
		connectionsLimit = 5
	case "team", "enterprise":
		connectionsLimit = -1 // unlimited
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

// Webhook handles Razorpay webhook events.
// Razorpay signs the payload with HMAC-SHA256 using the webhook secret.
// Set RAZORPAY_WEBHOOK_SECRET env var in Razorpay dashboard → Webhooks.
func (h *BillingHandler) Webhook(c *gin.Context) {
	// Read raw body for signature verification
	body, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read body"})
		return
	}

	// Verify signature (Razorpay sends X-Razorpay-Signature header)
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

	// Parse event
	var event struct {
		Event  string         `json:"event"`
		Payload map[string]interface{} `json:"payload"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	switch event.Event {
	case "payment.captured":
		// Already handled by /billing/verify — nothing extra needed
	case "subscription.activated":
		h.handleSubscriptionUpdate(event.Payload, "active")
	case "subscription.charged":
		// Renewal successful — ensure status stays active
		h.handleSubscriptionUpdate(event.Payload, "active")
	case "subscription.halted":
		// Payment failed after retries
		h.handleSubscriptionUpdate(event.Payload, "halted")
	case "subscription.cancelled":
		h.handleSubscriptionUpdate(event.Payload, "cancelled")
	case "subscription.completed":
		h.handleSubscriptionUpdate(event.Payload, "completed")
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

func (h *BillingHandler) handleSubscriptionUpdate(payload map[string]interface{}, newStatus string) {
	subPayload, ok := payload["subscription"].(map[string]interface{})
	if !ok {
		return
	}
	entity, ok := subPayload["entity"].(map[string]interface{})
	if !ok {
		return
	}
	subID, _ := entity["id"].(string)
	if subID == "" {
		return
	}

	// Find user by razorpay_subscription_id and update status
	_, err := h.DB.Exec(
		`UPDATE subscriptions SET status = $1, updated_at = NOW()
		 WHERE razorpay_subscription_id = $2`,
		newStatus, subID,
	)
	if err != nil {
		return
	}

	// If cancelled/halted, downgrade plan to free
	if newStatus == "cancelled" || newStatus == "halted" || newStatus == "completed" {
		h.DB.Exec(
			`UPDATE subscriptions SET plan = 'free', status = $1, updated_at = NOW()
			 WHERE razorpay_subscription_id = $2`,
			newStatus, subID,
		)
	}
}
