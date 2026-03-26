package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
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

// Webhook is kept as a stub for future use.
func (h *BillingHandler) Webhook(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"received": true})
}
