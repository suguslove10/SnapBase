package handlers

import (
	"database/sql"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"

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

// ListUsers returns one row per registered user with rolled-up activity.
// Query params:
//   q            — email substring filter (ILIKE)
//   plan         — exact plan filter (free|trial|pro|business|enterprise)
//   failing      — "1" to keep only users with a failed backup in the last 24h
//   sort         — created_desc (default), created_asc, backups_desc, failures_desc
func (h *AdminHandler) ListUsers(c *gin.Context) {
	if !adminAllowed(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}

	q := strings.TrimSpace(c.Query("q"))
	plan := strings.TrimSpace(c.Query("plan"))
	failing := c.Query("failing") == "1"
	sort := c.DefaultQuery("sort", "created_desc")

	orderBy := "u.created_at DESC"
	switch sort {
	case "created_asc":
		orderBy = "u.created_at ASC"
	case "backups_desc":
		orderBy = "backups_total DESC NULLS LAST, u.created_at DESC"
	case "failures_desc":
		orderBy = "failures_24h DESC NULLS LAST, u.created_at DESC"
	}

	args := []interface{}{}
	where := []string{}
	if q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, "u.email ILIKE $"+strconv.Itoa(len(args)))
	}
	if plan != "" {
		args = append(args, plan)
		where = append(where, "COALESCE(s.plan, 'free') = $"+strconv.Itoa(len(args)))
	}
	if failing {
		where = append(where, "COALESCE(failures_24h, 0) > 0")
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + strings.Join(where, " AND ")
	}

	query := `
		SELECT
			u.id, u.email, u.provider, u.created_at,
			COALESCE(s.plan, 'free') AS plan,
			COALESCE(s.status, 'active') AS sub_status,
			s.trial_ends_at,
			conn.cnt AS connection_count,
			COALESCE(conn.types, '{}') AS db_types,
			COALESCE(b.backups_total, 0) AS backups_total,
			COALESCE(b.backups_24h, 0)   AS backups_24h,
			COALESCE(b.failures_24h, 0)  AS failures_24h,
			b.last_backup_at,
			b.last_backup_status
		FROM users u
		LEFT JOIN subscriptions s ON s.user_id = u.id
		LEFT JOIN (
			SELECT user_id, COUNT(*) AS cnt, ARRAY_AGG(DISTINCT type) AS types
			FROM db_connections
			GROUP BY user_id
		) conn ON conn.user_id = u.id
		LEFT JOIN (
			SELECT
				dc.user_id,
				COUNT(*) AS backups_total,
				COUNT(*) FILTER (WHERE bj.started_at > NOW() - INTERVAL '24 hours') AS backups_24h,
				COUNT(*) FILTER (WHERE bj.status = 'failed' AND bj.started_at > NOW() - INTERVAL '24 hours') AS failures_24h,
				MAX(bj.started_at) AS last_backup_at,
				(ARRAY_AGG(bj.status ORDER BY bj.started_at DESC NULLS LAST))[1] AS last_backup_status
			FROM backup_jobs bj
			JOIN db_connections dc ON dc.id = bj.connection_id
			GROUP BY dc.user_id
		) b ON b.user_id = u.id
		` + whereSQL + `
		ORDER BY ` + orderBy + `
		LIMIT 500
	`

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type userRow struct {
		ID               int        `json:"id"`
		Email            string     `json:"email"`
		Provider         string     `json:"provider"`
		CreatedAt        time.Time  `json:"created_at"`
		Plan             string     `json:"plan"`
		SubStatus        string     `json:"sub_status"`
		TrialEndsAt      *time.Time `json:"trial_ends_at,omitempty"`
		ConnectionCount  int        `json:"connection_count"`
		DBTypes          []string   `json:"db_types"`
		BackupsTotal     int        `json:"backups_total"`
		Backups24h       int        `json:"backups_24h"`
		Failures24h      int        `json:"failures_24h"`
		LastBackupAt     *time.Time `json:"last_backup_at,omitempty"`
		LastBackupStatus string     `json:"last_backup_status,omitempty"`
	}

	users := []userRow{}
	for rows.Next() {
		var u userRow
		var connCount sql.NullInt64
		var trialEnds, lastBackup sql.NullTime
		var lastStatus sql.NullString
		var types pq.StringArray
		if err := rows.Scan(
			&u.ID, &u.Email, &u.Provider, &u.CreatedAt,
			&u.Plan, &u.SubStatus, &trialEnds,
			&connCount, &types,
			&u.BackupsTotal, &u.Backups24h, &u.Failures24h,
			&lastBackup, &lastStatus,
		); err != nil {
			continue
		}
		if connCount.Valid {
			u.ConnectionCount = int(connCount.Int64)
		}
		u.DBTypes = []string(types)
		if u.DBTypes == nil {
			u.DBTypes = []string{}
		}
		if trialEnds.Valid {
			t := trialEnds.Time
			u.TrialEndsAt = &t
		}
		if lastBackup.Valid {
			t := lastBackup.Time
			u.LastBackupAt = &t
		}
		if lastStatus.Valid {
			u.LastBackupStatus = lastStatus.String
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, gin.H{
		"generated_at": time.Now(),
		"count":        len(users),
		"users":        users,
	})
}

// UserDetail returns full per-user observability: connections, recent backups
// (with error messages), schedules, storage used, subscription details.
func (h *AdminHandler) UserDetail(c *gin.Context) {
	if !adminAllowed(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin only"})
		return
	}

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	// Base user
	type userInfo struct {
		ID        int       `json:"id"`
		Email     string    `json:"email"`
		Name      string    `json:"name,omitempty"`
		Provider  string    `json:"provider"`
		CreatedAt time.Time `json:"created_at"`
	}
	var u userInfo
	var name sql.NullString
	err = h.DB.QueryRow(
		"SELECT id, email, COALESCE(name,''), provider, created_at FROM users WHERE id = $1", id,
	).Scan(&u.ID, &u.Email, &name, &u.Provider, &u.CreatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u.Name = name.String

	// Subscription
	type subInfo struct {
		Plan               string     `json:"plan"`
		Status             string     `json:"status"`
		BillingPeriod      string     `json:"billing_period,omitempty"`
		BillingAmountCents int        `json:"billing_amount_cents"`
		TrialEndsAt        *time.Time `json:"trial_ends_at,omitempty"`
		CurrentPeriodEnd   *time.Time `json:"current_period_end,omitempty"`
		CancelAtPeriodEnd  bool       `json:"cancel_at_period_end"`
	}
	sub := subInfo{Plan: "free", Status: "active"}
	var trialEnds, periodEnd sql.NullTime
	var billingPeriod sql.NullString
	var billingAmount sql.NullInt64
	var cancelAtEnd sql.NullBool
	h.DB.QueryRow(`
		SELECT plan, status, billing_period, billing_amount_cents,
		       trial_ends_at, current_period_end, cancel_at_period_end
		FROM subscriptions WHERE user_id = $1
	`, id).Scan(&sub.Plan, &sub.Status, &billingPeriod, &billingAmount, &trialEnds, &periodEnd, &cancelAtEnd)
	if billingPeriod.Valid {
		sub.BillingPeriod = billingPeriod.String
	}
	if billingAmount.Valid {
		sub.BillingAmountCents = int(billingAmount.Int64)
	}
	if trialEnds.Valid {
		t := trialEnds.Time
		sub.TrialEndsAt = &t
	}
	if periodEnd.Valid {
		t := periodEnd.Time
		sub.CurrentPeriodEnd = &t
	}
	sub.CancelAtPeriodEnd = cancelAtEnd.Bool

	// Connections
	type connInfo struct {
		ID            int       `json:"id"`
		Name          string    `json:"name"`
		Type          string    `json:"type"`
		Host          string    `json:"host"`
		Port          int       `json:"port"`
		Database      string    `json:"database"`
		RetentionDays int       `json:"retention_days"`
		Encrypted     bool      `json:"encrypted"`
		CreatedAt     time.Time `json:"created_at"`
	}
	conns := []connInfo{}
	cRows, err := h.DB.Query(`
		SELECT id, name, type, COALESCE(host,''), COALESCE(port,0),
		       COALESCE(database_name,''), COALESCE(retention_days, 30),
		       COALESCE(encryption_enabled, false), created_at
		FROM db_connections WHERE user_id = $1 ORDER BY created_at DESC
	`, id)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var ci connInfo
			if err := cRows.Scan(&ci.ID, &ci.Name, &ci.Type, &ci.Host, &ci.Port,
				&ci.Database, &ci.RetentionDays, &ci.Encrypted, &ci.CreatedAt); err != nil {
				continue
			}
			conns = append(conns, ci)
		}
	}

	// Recent backup jobs (last 50, with errors)
	type backupRow struct {
		ID             int        `json:"id"`
		ConnectionID   int        `json:"connection_id"`
		ConnectionName string     `json:"connection_name"`
		ConnectionType string     `json:"connection_type"`
		Status         string     `json:"status"`
		SizeBytes      *int64     `json:"size_bytes,omitempty"`
		ErrorMessage   string     `json:"error_message,omitempty"`
		StartedAt      *time.Time `json:"started_at,omitempty"`
		CompletedAt    *time.Time `json:"completed_at,omitempty"`
	}
	backups := []backupRow{}
	bRows, err := h.DB.Query(`
		SELECT bj.id, bj.connection_id, dc.name, dc.type, bj.status,
		       bj.size_bytes, COALESCE(bj.error_message, ''),
		       bj.started_at, bj.completed_at
		FROM backup_jobs bj
		JOIN db_connections dc ON dc.id = bj.connection_id
		WHERE dc.user_id = $1
		ORDER BY bj.started_at DESC NULLS LAST
		LIMIT 50
	`, id)
	if err == nil {
		defer bRows.Close()
		for bRows.Next() {
			var br backupRow
			var size sql.NullInt64
			var startedAt, completedAt sql.NullTime
			if err := bRows.Scan(&br.ID, &br.ConnectionID, &br.ConnectionName, &br.ConnectionType,
				&br.Status, &size, &br.ErrorMessage, &startedAt, &completedAt); err != nil {
				continue
			}
			if size.Valid {
				v := size.Int64
				br.SizeBytes = &v
			}
			if startedAt.Valid {
				t := startedAt.Time
				br.StartedAt = &t
			}
			if completedAt.Valid {
				t := completedAt.Time
				br.CompletedAt = &t
			}
			backups = append(backups, br)
		}
	}

	// Schedules
	type schedRow struct {
		ID             int        `json:"id"`
		ConnectionID   int        `json:"connection_id"`
		ConnectionName string     `json:"connection_name"`
		CronExpression string     `json:"cron_expression"`
		Enabled        bool       `json:"enabled"`
		LastRun        *time.Time `json:"last_run,omitempty"`
		NextRun        *time.Time `json:"next_run,omitempty"`
	}
	scheds := []schedRow{}
	sRows, err := h.DB.Query(`
		SELECT s.id, s.connection_id, dc.name, s.cron_expression, s.enabled,
		       s.last_run, s.next_run
		FROM schedules s
		JOIN db_connections dc ON dc.id = s.connection_id
		WHERE dc.user_id = $1
		ORDER BY s.created_at DESC
	`, id)
	if err == nil {
		defer sRows.Close()
		for sRows.Next() {
			var sr schedRow
			var lastRun, nextRun sql.NullTime
			if err := sRows.Scan(&sr.ID, &sr.ConnectionID, &sr.ConnectionName,
				&sr.CronExpression, &sr.Enabled, &lastRun, &nextRun); err != nil {
				continue
			}
			if lastRun.Valid {
				t := lastRun.Time
				sr.LastRun = &t
			}
			if nextRun.Valid {
				t := nextRun.Time
				sr.NextRun = &t
			}
			scheds = append(scheds, sr)
		}
	}

	// Storage used (sum of successful backup sizes)
	var storageBytes int64
	h.DB.QueryRow(`
		SELECT COALESCE(SUM(bj.size_bytes), 0)
		FROM backup_jobs bj
		JOIN db_connections dc ON dc.id = bj.connection_id
		WHERE dc.user_id = $1 AND bj.status = 'success'
	`, id).Scan(&storageBytes)

	c.JSON(http.StatusOK, gin.H{
		"user":          u,
		"subscription":  sub,
		"connections":   conns,
		"recent_backups": backups,
		"schedules":     scheds,
		"storage_bytes": storageBytes,
	})
}
