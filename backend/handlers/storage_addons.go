package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	razorpay "github.com/razorpay/razorpay-go"

	"github.com/suguslove10/snapbase/config"
)

type StorageAddonHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

// Storage pack catalog: pack key → (Razorpay plan-id env var, GB, monthly price cents).
type addonPack struct {
	GB          int
	AmountCents int
	PlanID      string
}

func (h *StorageAddonHandler) packs() map[string]addonPack {
	return map[string]addonPack{
		"50":  {GB: 50, AmountCents: 500, PlanID: h.Cfg.RazorpayPlanStorage50},
		"100": {GB: 100, AmountCents: 900, PlanID: h.Cfg.RazorpayPlanStorage100},
	}
}

// List returns all active and historical add-on packs for the current user.
func (h *StorageAddonHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	rows, err := h.DB.Query(`
		SELECT id, COALESCE(razorpay_subscription_id, ''), pack_size_gb, amount_cents, status,
		       current_period_end, created_at, cancelled_at
		FROM storage_addons WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list add-ons"})
		return
	}
	defer rows.Close()

	type Item struct {
		ID                     int        `json:"id"`
		RazorpaySubscriptionID string     `json:"razorpay_subscription_id"`
		PackSizeGB             int        `json:"pack_size_gb"`
		AmountCents            int        `json:"amount_cents"`
		Status                 string     `json:"status"`
		CurrentPeriodEnd       *time.Time `json:"current_period_end"`
		CreatedAt              time.Time  `json:"created_at"`
		CancelledAt            *time.Time `json:"cancelled_at"`
	}
	out := []Item{}
	for rows.Next() {
		var it Item
		var pe, ca sql.NullTime
		if err := rows.Scan(&it.ID, &it.RazorpaySubscriptionID, &it.PackSizeGB, &it.AmountCents, &it.Status, &pe, &it.CreatedAt, &ca); err != nil {
			continue
		}
		if pe.Valid {
			it.CurrentPeriodEnd = &pe.Time
		}
		if ca.Valid {
			it.CancelledAt = &ca.Time
		}
		out = append(out, it)
	}
	c.JSON(http.StatusOK, out)
}

// Checkout creates a Razorpay subscription for an add-on storage pack.
// Body: { pack: "50" | "100" }
func (h *StorageAddonHandler) Checkout(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req struct {
		Pack string `json:"pack" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pack is required"})
		return
	}
	pack, ok := h.packs()[req.Pack]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pack must be '50' or '100'"})
		return
	}
	if pack.PlanID == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": fmt.Sprintf("Storage pack plan for %dGB is not configured. Set RAZORPAY_PLAN_STORAGE_%dGB.", pack.GB, pack.GB),
		})
		return
	}

	client := razorpay.NewClient(h.Cfg.RazorpayKeyID, h.Cfg.RazorpayKeySecret)
	subData := map[string]interface{}{
		"plan_id":         pack.PlanID,
		"total_count":     12, // 12 monthly cycles
		"customer_notify": 1,
		"notes": map[string]interface{}{
			"user_id":  fmt.Sprintf("%d", userID),
			"addon":    "storage",
			"pack_gb":  fmt.Sprintf("%d", pack.GB),
		},
	}
	sub, err := client.Subscription.Create(subData, nil)
	if err != nil {
		log.Printf("[storage-addon] subscription.create failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create subscription"})
		return
	}
	subID, _ := sub["id"].(string)

	h.DB.Exec(`
		INSERT INTO storage_addons (user_id, razorpay_subscription_id, pack_size_gb, amount_cents, status)
		VALUES ($1, $2, $3, $4, 'created')
	`, userID, subID, pack.GB, pack.AmountCents)

	c.JSON(http.StatusOK, gin.H{
		"subscription_id": subID,
		"pack":            req.Pack,
		"amount_cents":    pack.AmountCents,
		"key_id":          h.Cfg.RazorpayKeyID,
	})
}

// Verify activates the add-on after successful Razorpay checkout.
// Same signature scheme as the main subscription verify.
func (h *StorageAddonHandler) Verify(c *gin.Context) {
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
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(req.RazorpaySignature)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid signature"})
		return
	}

	periodEnd := time.Now().AddDate(0, 1, 0)
	res, err := h.DB.Exec(`
		UPDATE storage_addons SET status = 'active', current_period_end = $1
		WHERE user_id = $2 AND razorpay_subscription_id = $3
	`, periodEnd, userID, req.RazorpaySubscriptionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to activate"})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Add-on not found"})
		return
	}

	// Record invoice
	var amount, gb int
	h.DB.QueryRow(
		"SELECT amount_cents, pack_size_gb FROM storage_addons WHERE razorpay_subscription_id = $1",
		req.RazorpaySubscriptionID,
	).Scan(&amount, &gb)
	h.DB.Exec(`
		INSERT INTO invoices (user_id, razorpay_payment_id, razorpay_subscription_id, amount_cents, currency, status, description, paid_at)
		VALUES ($1, $2, $3, $4, 'USD', 'paid', $5, NOW())
	`, userID, req.RazorpayPaymentID, req.RazorpaySubscriptionID, amount, fmt.Sprintf("Storage add-on +%dGB", gb))

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// Cancel cancels an add-on at period end.
func (h *StorageAddonHandler) Cancel(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req struct {
		ID int `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id required"})
		return
	}
	var subID sql.NullString
	err := h.DB.QueryRow(
		"SELECT razorpay_subscription_id FROM storage_addons WHERE id = $1 AND user_id = $2",
		req.ID, userID,
	).Scan(&subID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Add-on not found"})
		return
	}

	if subID.Valid && subID.String != "" {
		client := razorpay.NewClient(h.Cfg.RazorpayKeyID, h.Cfg.RazorpayKeySecret)
		client.Subscription.Cancel(subID.String, map[string]interface{}{"cancel_at_cycle_end": 1}, nil)
	}
	h.DB.Exec(
		"UPDATE storage_addons SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1 AND user_id = $2",
		req.ID, userID,
	)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
