package webhooks

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// WebhookPayload is the envelope sent for every event.
type WebhookPayload struct {
	Event     string      `json:"event"`
	Timestamp string      `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// BackupEventData is the data block for backup.* events.
type BackupEventData struct {
	ConnectionName string `json:"connection_name"`
	DBType         string `json:"db_type"`
	SizeBytes      int64  `json:"size_bytes"`
	SizeFormatted  string `json:"size_formatted"`
	DurationMS     int64  `json:"duration_ms"`
	Verified       bool   `json:"verified"`
	BackupID       int    `json:"backup_id"`
}

// AnomalyEventData is the data block for anomaly.detected.
type AnomalyEventData struct {
	ConnectionName string `json:"connection_name"`
	Type           string `json:"type"`
	Message        string `json:"message"`
	Severity       string `json:"severity"`
}

// ScheduleEventData is the data block for schedule.* events.
type ScheduleEventData struct {
	ScheduleID     int    `json:"schedule_id"`
	ConnectionName string `json:"connection_name"`
	CronExpression string `json:"cron_expression"`
}

// MemberEventData is the data block for member.* events.
type MemberEventData struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// DeliverWebhook delivers an event to all enabled webhooks subscribed to it for the org.
// Runs concurrently; does not block the caller.
func DeliverWebhook(db *sql.DB, orgID int, event string, data interface{}) {
	if orgID == 0 {
		return
	}
	go func() {
		rows, err := db.Query(
			`SELECT id, url, COALESCE(secret,'') FROM webhooks WHERE org_id = $1 AND enabled = true AND $2 = ANY(events)`,
			orgID, event,
		)
		if err != nil {
			log.Printf("webhooks: failed to query webhooks for org %d: %v", orgID, err)
			return
		}
		defer rows.Close()

		payload := WebhookPayload{
			Event:     event,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Data:      data,
		}
		payloadBytes, err := json.Marshal(payload)
		if err != nil {
			log.Printf("webhooks: failed to marshal payload: %v", err)
			return
		}

		for rows.Next() {
			var wid int
			var wurl, wsecret string
			if err := rows.Scan(&wid, &wurl, &wsecret); err != nil {
				continue
			}
			go func(id int, url, secret string) {
				deliverOne(db, id, url, secret, event, payloadBytes)
			}(wid, wurl, wsecret)
		}
	}()
}

// DeliverWebhookSync delivers to a single webhook synchronously (for test endpoint).
// Returns (statusCode, responseBody, failed).
func DeliverWebhookSync(db *sql.DB, webhookID int, event string, data interface{}) (int, string, bool) {
	var wurl, wsecret string
	err := db.QueryRow(`SELECT url, COALESCE(secret,'') FROM webhooks WHERE id = $1`, webhookID).Scan(&wurl, &wsecret)
	if err != nil {
		return 0, "", true
	}

	payload := WebhookPayload{
		Event:     event,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Data:      data,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return 0, "", true
	}

	status, body, failed := postWebhook(wurl, wsecret, payloadBytes)
	recordDelivery(db, webhookID, event, payloadBytes, status, body, failed)
	return status, body, failed
}

func deliverOne(db *sql.DB, webhookID int, url, secret, event string, payloadBytes []byte) {
	// Exponential backoff: 5 attempts with delays 0s, 1s, 2s, 4s, 8s
	delays := []time.Duration{0, 1 * time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second}
	var status int
	var body string
	var failed bool
	for i, delay := range delays {
		if delay > 0 {
			time.Sleep(delay)
		}
		status, body, failed = postWebhook(url, secret, payloadBytes)
		if !failed {
			break
		}
		log.Printf("webhooks: delivery attempt %d/%d failed for webhook %d (status=%d)", i+1, len(delays), webhookID, status)
	}
	recordDelivery(db, webhookID, event, payloadBytes, status, body, failed)
}

func postWebhook(url, secret string, payloadBytes []byte) (int, string, bool) {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequest("POST", url, bytes.NewReader(payloadBytes))
	if err != nil {
		return 0, err.Error(), true
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "SnapBase-Webhook/1.0")

	if secret != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(payloadBytes)
		sig := hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-SnapBase-Signature", fmt.Sprintf("sha256=%s", sig))
	}

	resp, err := client.Do(req)
	if err != nil {
		return 0, err.Error(), true
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	failed := resp.StatusCode < 200 || resp.StatusCode >= 300
	return resp.StatusCode, string(respBody), failed
}

func recordDelivery(db *sql.DB, webhookID int, event string, payloadBytes []byte, status int, body string, failed bool) {
	now := time.Now()
	var statusPtr *int
	if status > 0 {
		statusPtr = &status
	}
	_, err := db.Exec(
		`INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body, delivered_at, failed)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		webhookID, event, string(payloadBytes), statusPtr, body, now, failed,
	)
	if err != nil {
		log.Printf("webhooks: failed to record delivery for webhook %d: %v", webhookID, err)
	}
}

// FormatSize formats bytes to human-readable string.
func FormatSize(b int64) string {
	if b == 0 {
		return "0 B"
	}
	const k = 1024
	sizes := []string{"B", "KB", "MB", "GB"}
	i := 0
	size := float64(b)
	for size >= float64(k) && i < len(sizes)-1 {
		size /= float64(k)
		i++
	}
	return fmt.Sprintf("%.2f %s", size, sizes[i])
}
