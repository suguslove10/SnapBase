package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/config"
)

type AdminHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

// adminAllowed returns true if the caller's email is on the admin allowlist.
// Set ADMIN_EMAILS env var (comma-separated) to control this.
func adminAllowed(c *gin.Context) bool {
	email := strings.ToLower(c.GetString("email"))
	allow := os.Getenv("ADMIN_EMAILS")
	if allow == "" {
		// Default: only sugugalag@gmail.com (your account).
		allow = "sugugalag@gmail.com"
	}
	for _, a := range strings.Split(allow, ",") {
		if strings.TrimSpace(strings.ToLower(a)) == email {
			return true
		}
	}
	return false
}

// Metrics returns business KPIs: MRR, ARR, signups, churn, conversion.
// Tracked on /admin/metrics.
func (h *AdminHandler) Metrics(c *gin.Context) {
	if !adminAllowed(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}

	type Plan struct {
		Plan  string
		Count int
	}

	// Active paid subs by plan/period
	var mrrCents, arrCents int
	var totalActive, totalTrialing int
	rows, err := h.DB.Query(`
		SELECT plan, COALESCE(billing_period, 'monthly'), COUNT(*) AS n,
		       COALESCE(SUM(billing_amount_cents), 0) AS amount
		FROM subscriptions
		WHERE status = 'active' AND plan != 'free'
		GROUP BY plan, billing_period
	`)
	planBreakdown := []gin.H{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var plan, period string
			var n, amount int
			if err := rows.Scan(&plan, &period, &n, &amount); err != nil {
				continue
			}
			// Convert annual amount to MRR-equivalent.
			monthlyEq := amount
			if period == "annual" {
				monthlyEq = amount / 12
			}
			mrrCents += monthlyEq
			arrCents += monthlyEq * 12
			totalActive += n
			planBreakdown = append(planBreakdown, gin.H{
				"plan": plan, "period": period, "count": n, "amount_cents": amount,
			})
		}
	}

	h.DB.QueryRow("SELECT COUNT(*) FROM subscriptions WHERE status = 'trialing' AND trial_ends_at > NOW()").Scan(&totalTrialing)

	// User counts
	var totalUsers int
	h.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)

	// Signups in last 7 / 30 days
	var signups7, signups30 int
	h.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days'").Scan(&signups7)
	h.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days'").Scan(&signups30)

	// Trial → paid conversion (last 30d)
	var trialsStarted, trialsConverted int
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM subscriptions
		WHERE trial_started_at > NOW() - INTERVAL '30 days'
	`).Scan(&trialsStarted)
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM subscriptions
		WHERE trial_started_at > NOW() - INTERVAL '30 days' AND status = 'active' AND plan != 'free'
	`).Scan(&trialsConverted)

	conversionRate := 0.0
	if trialsStarted > 0 {
		conversionRate = float64(trialsConverted) / float64(trialsStarted) * 100
	}

	// Churn (cancellations in last 30d)
	var churned30 int
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM subscriptions
		WHERE status IN ('cancelled', 'halted', 'expired') AND updated_at > NOW() - INTERVAL '30 days'
	`).Scan(&churned30)

	// Revenue captured in last 30 days
	var revenue30 int
	h.DB.QueryRow(
		"SELECT COALESCE(SUM(amount_cents), 0) FROM invoices WHERE paid_at > NOW() - INTERVAL '30 days' AND status = 'paid'",
	).Scan(&revenue30)

	// Top backup activity
	var totalBackups, backupsToday int
	h.DB.QueryRow("SELECT COUNT(*) FROM backup_jobs").Scan(&totalBackups)
	h.DB.QueryRow("SELECT COUNT(*) FROM backup_jobs WHERE started_at > NOW() - INTERVAL '24 hours'").Scan(&backupsToday)

	c.JSON(http.StatusOK, gin.H{
		"generated_at":          time.Now(),
		"mrr_cents":             mrrCents,
		"arr_cents":             arrCents,
		"active_paid":           totalActive,
		"trialing":              totalTrialing,
		"plan_breakdown":        planBreakdown,
		"total_users":           totalUsers,
		"signups_7d":            signups7,
		"signups_30d":           signups30,
		"trial_to_paid_30d":     conversionRate,
		"trials_started_30d":    trialsStarted,
		"trials_converted_30d":  trialsConverted,
		"churned_30d":           churned30,
		"revenue_30d_cents":     revenue30,
		"total_backups":         totalBackups,
		"backups_24h":           backupsToday,
	})
}
