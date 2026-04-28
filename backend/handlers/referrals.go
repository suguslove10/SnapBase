package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/config"
)

type ReferralHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

// EnsureReferralCode lazily generates a code if the user doesn't have one yet.
// Returns the user's referral code.
func ensureReferralCode(db *sql.DB, userID int) string {
	var code sql.NullString
	db.QueryRow("SELECT referral_code FROM users WHERE id = $1", userID).Scan(&code)
	if code.Valid && code.String != "" {
		return code.String
	}
	// Generate up to 5 attempts on collision.
	for i := 0; i < 5; i++ {
		b := make([]byte, 5)
		if _, err := rand.Read(b); err != nil {
			continue
		}
		newCode := strings.ToLower(hex.EncodeToString(b))
		if _, err := db.Exec(
			"UPDATE users SET referral_code = $1 WHERE id = $2 AND (referral_code IS NULL OR referral_code = '')",
			newCode, userID,
		); err == nil {
			db.QueryRow("SELECT referral_code FROM users WHERE id = $1", userID).Scan(&code)
			if code.Valid {
				return code.String
			}
		}
	}
	return ""
}

// Stats returns the user's referral code, share link, signups, and lifetime credit earned.
func (h *ReferralHandler) Stats(c *gin.Context) {
	userID := c.GetInt("user_id")
	code := ensureReferralCode(h.DB, userID)

	var signups, paying, totalCents, paidOutCents int
	h.DB.QueryRow("SELECT COUNT(*) FROM users WHERE referred_by = $1", userID).Scan(&signups)
	h.DB.QueryRow(`
		SELECT COUNT(DISTINCT u.id) FROM users u
		JOIN subscriptions s ON s.user_id = u.id
		WHERE u.referred_by = $1 AND s.status IN ('active', 'trialing') AND s.plan != 'free'
	`, userID).Scan(&paying)
	h.DB.QueryRow("SELECT COALESCE(SUM(amount_cents), 0) FROM referral_credits WHERE referrer_id = $1", userID).Scan(&totalCents)
	h.DB.QueryRow("SELECT COALESCE(SUM(amount_cents), 0) FROM referral_credits WHERE referrer_id = $1 AND paid_out = true", userID).Scan(&paidOutCents)

	link := h.Cfg.FrontendURL + "/signup?ref=" + code
	c.JSON(http.StatusOK, gin.H{
		"code":              code,
		"link":              link,
		"signups":           signups,
		"paying_referrals":  paying,
		"earned_cents":      totalCents,
		"paid_out_cents":    paidOutCents,
		"pending_cents":     totalCents - paidOutCents,
		"commission_rate":   "20%",
	})
}
