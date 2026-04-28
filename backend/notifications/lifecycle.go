package notifications

import (
	"bytes"
	"database/sql"
	"fmt"
	"html/template"
	"log"
	"time"
)

// LifecycleEmail represents one campaign in the onboarding sequence.
type LifecycleEmail struct {
	Type      string // unique key, e.g. "welcome", "day-1"
	DelayDays int    // days after signup
	Subject   string
	Title     string
	Lead      string
	Body      string // markdown-like, becomes paragraphs
	CTAText   string
	CTAURL    string // relative — frontend URL prepended
}

var lifecycleSequence = []LifecycleEmail{
	{
		Type:      "welcome",
		DelayDays: 0,
		Subject:   "Welcome to SnapBase — your trial just started",
		Title:     "Welcome aboard!",
		Lead:      "You're on a 14-day free trial of SnapBase Pro — no credit card needed.",
		Body:      "Pro gives you 5 connections, 10 GB storage, every-15-minute schedules, and more. To get the most out of it, set up your first database backup now — most teams have it running in under 60 seconds.",
		CTAText:   "Set up your first backup",
		CTAURL:    "/connections",
	},
	{
		Type:      "day-1",
		DelayDays: 1,
		Subject:   "One DB protected — what about your staging?",
		Title:     "Add your second database",
		Lead:      "You've added one connection. Pro lets you protect up to 5.",
		Body:      "Most teams set up production AND staging — that way you can run staging restore tests without touching prod. Adding another connection takes 30 seconds.",
		CTAText:   "Add another connection",
		CTAURL:    "/connections",
	},
	{
		Type:      "day-3",
		DelayDays: 3,
		Subject:   "Find slow queries with AI Schema Insights",
		Title:     "AI scans your DB for issues",
		Lead:      "While you're on Pro, our AI can analyze your schema and surface missing indexes, naming issues, and performance risks.",
		Body:      "It runs against your live schema (read-only) and generates a report you can share with your team. Free during your trial.",
		CTAText:   "Run an insights scan",
		CTAURL:    "/insights",
	},
	{
		Type:      "day-7",
		DelayDays: 7,
		Subject:   "You're halfway through your Pro trial",
		Title:     "7 days down, 7 to go",
		Lead:      "Your trial ends in 7 days. Lock in Pro and keep everything you've set up.",
		Body:      "Pro is $9/mo (or $7.50/mo annual — that's 17% off). Cancel anytime, 30-day money-back guarantee. No surprise charges.",
		CTAText:   "Keep Pro for $9/mo",
		CTAURL:    "/billing",
	},
	{
		Type:      "day-13",
		DelayDays: 13,
		Subject:   "Your trial ends tomorrow",
		Title:     "Last day of your trial",
		Lead:      "Tomorrow your account drops to Free — 2 connections, daily backups only, 1 GB storage.",
		Body:      "Add a payment method now to keep your existing setup on Pro. We won't touch your backups either way — they stay safe in storage.",
		CTAText:   "Stay on Pro",
		CTAURL:    "/billing",
	},
}

func SendLifecycleEmail(cfg *EmailConfig, to string, frontendURL string, e LifecycleEmail) {
	if !cfg.Enabled {
		return
	}
	html, err := renderLifecycleHTML(e, frontendURL)
	if err != nil {
		log.Printf("[lifecycle] render error: %v", err)
		return
	}
	plain := fmt.Sprintf("%s\n\n%s\n\n%s\n\n%s — %s%s\n", e.Title, e.Lead, e.Body, e.CTAText, frontendURL, e.CTAURL)
	sendEmail(cfg, to, e.Subject, plain, html)
}

func renderLifecycleHTML(e LifecycleEmail, frontendURL string) (string, error) {
	data := struct {
		Title   string
		Lead    string
		Body    string
		CTAText string
		CTAURL  string
	}{e.Title, e.Lead, e.Body, e.CTAText, frontendURL + e.CTAURL}
	var buf bytes.Buffer
	if err := lifecycleTemplate.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

var lifecycleTemplate = template.Must(template.New("lifecycle").Parse(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>{{.Title}}</title></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0f1e;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
      <tr><td align="center" style="padding-bottom:32px;">
        <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">SnapBase</span>
      </td></tr>
      <tr><td style="background:#0d1526;border-radius:16px;border:1px solid rgba(255,255,255,0.08);padding:40px 36px;">
        <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">{{.Title}}</h1>
        <p style="margin:0 0 16px 0;font-size:15px;color:#cbd5e1;line-height:1.6;">{{.Lead}}</p>
        <p style="margin:0 0 32px 0;font-size:14px;color:#94a3b8;line-height:1.6;">{{.Body}}</p>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td>
            <a href="{{.CTAURL}}" style="display:inline-block;background:linear-gradient(135deg,#00b4ff,#00f5d4);color:#0a0f1e;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;">{{.CTAText}}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding-top:24px;">
        <p style="margin:0;font-size:11px;color:#475569;line-height:1.6;">
          You're getting this because you signed up at <a href="https://getsnapbase.com" style="color:#64748b;">getsnapbase.com</a>.<br>
          To stop these onboarding emails, reply with "unsubscribe".
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`))

// RunLifecycleJob is intended to run every hour. For each user past the delay
// of an unsent campaign, it sends the email and records the send.
// Idempotent: lifecycle_emails table has UNIQUE(user_id, email_type).
func RunLifecycleJob(db *sql.DB, cfg *EmailConfig, frontendURL string) {
	if !cfg.Enabled {
		return
	}
	now := time.Now()
	for _, e := range lifecycleSequence {
		threshold := now.AddDate(0, 0, -e.DelayDays)
		rows, err := db.Query(`
			SELECT u.id, u.email FROM users u
			LEFT JOIN lifecycle_emails l ON l.user_id = u.id AND l.email_type = $1
			WHERE l.id IS NULL AND u.created_at <= $2 AND u.email IS NOT NULL
			LIMIT 200
		`, e.Type, threshold)
		if err != nil {
			log.Printf("[lifecycle] query error for %s: %v", e.Type, err)
			continue
		}
		var sent int
		for rows.Next() {
			var uid int
			var email string
			if err := rows.Scan(&uid, &email); err != nil {
				continue
			}
			SendLifecycleEmail(cfg, email, frontendURL, e)
			db.Exec(
				`INSERT INTO lifecycle_emails (user_id, email_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
				uid, e.Type,
			)
			sent++
		}
		rows.Close()
		if sent > 0 {
			log.Printf("[lifecycle] sent %d %s email(s)", sent, e.Type)
		}
	}
}
