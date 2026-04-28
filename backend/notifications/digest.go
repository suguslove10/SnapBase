package notifications

import (
	"bytes"
	"database/sql"
	"fmt"
	"html/template"
	"log"
	"time"
)

// WeeklyDigest holds the data for a user's weekly backup summary.
type WeeklyDigest struct {
	WeekStart    time.Time
	WeekEnd      time.Time
	TotalBackups int
	SuccessRate  float64
	GrowthBytes  int64
	Anomalies    int
	Connections  []ConnectionSummary
	DashboardURL string
}

type ConnectionSummary struct {
	Name        string
	Type        string
	Size        string
	GrowthPct   float64
	GrowthLabel string // e.g. "+12.4%" or "−3.1%"
	Backups     int
	Success     int
	Failed      int
}

func renderWeeklyDigest(d WeeklyDigest) (string, error) {
	var buf bytes.Buffer
	if err := digestTemplate.Execute(&buf, d); err != nil {
		return "", err
	}
	return buf.String(), nil
}

var digestTemplate = template.Must(template.New("digest").Parse(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Your weekly backup digest</title></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0f1e;padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
      <tr><td align="center" style="padding-bottom:32px;">
        <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">SnapBase</span>
      </td></tr>
      <tr><td style="background:#0d1526;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:36px 36px 28px 36px;">
        <p style="margin:0 0 4px 0;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Weekly digest</p>
        <h1 style="margin:0 0 24px 0;font-size:22px;font-weight:700;color:#ffffff;">Your backup activity this week</h1>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="33%" style="background:rgba(0,180,255,0.06);border:1px solid rgba(0,180,255,0.15);border-radius:10px;padding:14px;text-align:center;">
              <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Backups</div>
              <div style="font-size:22px;font-weight:700;color:#00b4ff;">{{.TotalBackups}}</div>
            </td>
            <td width="2%"></td>
            <td width="33%" style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.15);border-radius:10px;padding:14px;text-align:center;">
              <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Success</div>
              <div style="font-size:22px;font-weight:700;color:#00ff88;">{{printf "%.0f" .SuccessRate}}%</div>
            </td>
            <td width="2%"></td>
            <td width="30%" style="background:rgba(168,139,250,0.06);border:1px solid rgba(168,139,250,0.15);border-radius:10px;padding:14px;text-align:center;">
              <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Anomalies</div>
              <div style="font-size:22px;font-weight:700;color:#a78bfa;">{{.Anomalies}}</div>
            </td>
          </tr>
        </table>

        <h2 style="margin:28px 0 12px 0;font-size:14px;font-weight:600;color:#cbd5e1;">Per-connection</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.02);border-radius:10px;border:1px solid rgba(255,255,255,0.06);">
          <tr>
            <td style="padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#475569;">Connection</td>
            <td style="padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:right;">Size</td>
            <td style="padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:right;">Growth</td>
            <td style="padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:right;">Backups</td>
          </tr>
          {{range .Connections}}
          <tr style="border-top:1px solid rgba(255,255,255,0.04);">
            <td style="padding:12px 14px;font-size:13px;color:#ffffff;font-weight:500;">{{.Name}}<br><span style="font-size:11px;color:#64748b;">{{.Type}}</span></td>
            <td style="padding:12px 14px;font-size:12px;color:#cbd5e1;text-align:right;font-family:monospace;">{{.Size}}</td>
            <td style="padding:12px 14px;font-size:12px;text-align:right;font-family:monospace;color:{{if gt .GrowthPct 0.0}}#00ff88{{else}}#94a3b8{{end}};">{{.GrowthLabel}}</td>
            <td style="padding:12px 14px;font-size:12px;color:#cbd5e1;text-align:right;font-family:monospace;">{{.Success}}/{{.Backups}}</td>
          </tr>
          {{end}}
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
          <tr><td align="center">
            <a href="{{.DashboardURL}}" style="display:inline-block;background:linear-gradient(135deg,#00b4ff,#00f5d4);color:#0a0f1e;font-weight:700;font-size:13px;padding:12px 28px;border-radius:10px;text-decoration:none;">View dashboard</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding-top:24px;">
        <p style="margin:0;font-size:11px;color:#475569;line-height:1.6;">
          Sent every Monday. <a href="{{.DashboardURL}}/settings" style="color:#64748b;">Manage notifications</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`))

// SendWeeklyDigests runs Mondays — looks up each user's connections, computes
// week-over-week growth and success/fail counts, and sends a digest email.
// Idempotent via lifecycle_emails(user_id, "weekly-digest-YYYYWW").
func SendWeeklyDigests(db *sql.DB, cfg *EmailConfig, frontendURL string) {
	if !cfg.Enabled {
		return
	}
	now := time.Now().UTC()
	year, week := now.ISOWeek()
	emailType := fmt.Sprintf("weekly-digest-%dW%02d", year, week)

	// Find paying / trialing users with at least one connection.
	rows, err := db.Query(`
		SELECT DISTINCT u.id, u.email FROM users u
		JOIN db_connections dc ON dc.user_id = u.id
		LEFT JOIN lifecycle_emails l ON l.user_id = u.id AND l.email_type = $1
		WHERE l.id IS NULL AND u.email IS NOT NULL AND u.email != ''
		LIMIT 500
	`, emailType)
	if err != nil {
		log.Printf("[digest] users query failed: %v", err)
		return
	}
	defer rows.Close()

	weekStart := now.AddDate(0, 0, -7)
	weekEnd := now
	prevWeekStart := now.AddDate(0, 0, -14)

	type uRec struct {
		id    int
		email string
	}
	users := []uRec{}
	for rows.Next() {
		var u uRec
		if err := rows.Scan(&u.id, &u.email); err != nil {
			continue
		}
		users = append(users, u)
	}

	for _, u := range users {
		digest := buildDigestForUser(db, u.id, weekStart, weekEnd, prevWeekStart, frontendURL)
		if digest.TotalBackups == 0 && len(digest.Connections) == 0 {
			continue // skip users with no activity this week
		}
		html, err := renderWeeklyDigest(digest)
		if err != nil {
			log.Printf("[digest] render error for user %d: %v", u.id, err)
			continue
		}
		plain := fmt.Sprintf("Your SnapBase weekly digest:\n%d backups · %.0f%% success · %d anomalies.\nSee details: %s\n", digest.TotalBackups, digest.SuccessRate, digest.Anomalies, frontendURL+"/dashboard")
		sendEmail(cfg, u.email, "Your SnapBase weekly digest", plain, html)
		db.Exec(
			"INSERT INTO lifecycle_emails (user_id, email_type) VALUES ($1, $2) ON CONFLICT DO NOTHING",
			u.id, emailType,
		)
	}
	log.Printf("[digest] processed %d users for %s", len(users), emailType)
}

func buildDigestForUser(db *sql.DB, userID int, weekStart, weekEnd, prevWeekStart time.Time, frontendURL string) WeeklyDigest {
	d := WeeklyDigest{WeekStart: weekStart, WeekEnd: weekEnd, DashboardURL: frontendURL + "/dashboard"}

	// Total + success counts for the week.
	db.QueryRow(`
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE status = 'success')
		FROM backup_jobs b
		JOIN db_connections dc ON dc.id = b.connection_id
		WHERE dc.user_id = $1 AND b.started_at BETWEEN $2 AND $3
	`, userID, weekStart, weekEnd).Scan(&d.TotalBackups, new(int))
	var successCount int
	db.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b JOIN db_connections dc ON dc.id = b.connection_id
		WHERE dc.user_id = $1 AND b.started_at BETWEEN $2 AND $3 AND b.status = 'success'
	`, userID, weekStart, weekEnd).Scan(&successCount)
	if d.TotalBackups > 0 {
		d.SuccessRate = float64(successCount) / float64(d.TotalBackups) * 100
	} else {
		d.SuccessRate = 100
	}

	db.QueryRow(`
		SELECT COUNT(*) FROM anomalies a
		JOIN db_connections dc ON dc.id = a.connection_id
		WHERE dc.user_id = $1 AND a.created_at BETWEEN $2 AND $3
	`, userID, weekStart, weekEnd).Scan(&d.Anomalies)

	// Per-connection rollup.
	rows, err := db.Query(`
		SELECT dc.id, dc.name, dc.type FROM db_connections dc
		WHERE dc.user_id = $1 ORDER BY dc.created_at LIMIT 20
	`, userID)
	if err != nil {
		return d
	}
	defer rows.Close()

	for rows.Next() {
		var connID int
		var c ConnectionSummary
		if err := rows.Scan(&connID, &c.Name, &c.Type); err != nil {
			continue
		}
		var totalSize, prevSize sql.NullInt64
		db.QueryRow("SELECT MAX(size_bytes) FROM backup_jobs WHERE connection_id = $1 AND status = 'success' AND started_at BETWEEN $2 AND $3", connID, weekStart, weekEnd).Scan(&totalSize)
		db.QueryRow("SELECT MAX(size_bytes) FROM backup_jobs WHERE connection_id = $1 AND status = 'success' AND started_at BETWEEN $2 AND $3", connID, prevWeekStart, weekStart).Scan(&prevSize)

		if totalSize.Valid {
			c.Size = formatSize(totalSize.Int64)
		} else {
			c.Size = "—"
		}
		if totalSize.Valid && prevSize.Valid && prevSize.Int64 > 0 {
			c.GrowthPct = (float64(totalSize.Int64) - float64(prevSize.Int64)) / float64(prevSize.Int64) * 100
		}
		if c.GrowthPct > 0 {
			c.GrowthLabel = fmt.Sprintf("+%.1f%%", c.GrowthPct)
		} else if c.GrowthPct < 0 {
			c.GrowthLabel = fmt.Sprintf("%.1f%%", c.GrowthPct)
		} else {
			c.GrowthLabel = "—"
		}

		db.QueryRow(`
			SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'success'), COUNT(*) FILTER (WHERE status = 'failed')
			FROM backup_jobs WHERE connection_id = $1 AND started_at BETWEEN $2 AND $3
		`, connID, weekStart, weekEnd).Scan(&c.Backups, &c.Success, &c.Failed)

		if c.Backups > 0 {
			d.Connections = append(d.Connections, c)
		}
	}
	return d
}
