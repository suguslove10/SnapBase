package backup

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/suguslove10/snapbase/notifications"
	"github.com/suguslove10/snapbase/webhooks"
)

type AnomalyDetector struct {
	DB *sql.DB
}

type Anomaly struct {
	Type     string
	Message  string
	Severity string // warning, critical
}

func (a *AnomalyDetector) DetectAnomalies(connectionID int, backupJobID int, currentSize int64) []Anomaly {
	var anomalies []Anomaly

	avgSize := a.getAverageSize(connectionID)
	if avgSize <= 0 {
		return anomalies
	}

	ratio := float64(currentSize) / float64(avgSize)

	if ratio < 0.5 {
		anomalies = append(anomalies, Anomaly{
			Type:     "size_too_small",
			Message:  fmt.Sprintf("Backup unusually small (%.1f%% of average) — possible data loss", ratio*100),
			Severity: "critical",
		})
	}

	if ratio > 3.0 {
		anomalies = append(anomalies, Anomaly{
			Type:     "size_too_large",
			Message:  fmt.Sprintf("Backup unusually large (%.0f%% of average) — unexpected data growth", ratio*100),
			Severity: "warning",
		})
	}

	// Store anomalies and deliver webhooks
	var orgID int
	a.DB.QueryRow("SELECT COALESCE(org_id, 0) FROM db_connections WHERE id = $1", connectionID).Scan(&orgID)

	for _, anom := range anomalies {
		a.DB.Exec(`
			INSERT INTO anomalies (connection_id, backup_job_id, type, message, severity)
			VALUES ($1, $2, $3, $4, $5)
		`, connectionID, backupJobID, anom.Type, anom.Message, anom.Severity)
		log.Printf("Anomaly detected: connection=%d type=%s message=%s", connectionID, anom.Type, anom.Message)

		// Deliver webhook for anomaly
		if orgID > 0 {
			connName := ""
			a.DB.QueryRow("SELECT name FROM db_connections WHERE id = $1", connectionID).Scan(&connName)
			webhooks.DeliverWebhook(a.DB, orgID, "anomaly.detected", webhooks.AnomalyEventData{
				ConnectionName: connName,
				Type:           anom.Type,
				Message:        anom.Message,
				Severity:       anom.Severity,
			})
		}
	}

	return anomalies
}

func (a *AnomalyDetector) getAverageSize(connectionID int) int64 {
	var avg sql.NullFloat64
	a.DB.QueryRow(`
		SELECT AVG(size_bytes) FROM (
			SELECT size_bytes FROM backup_jobs
			WHERE connection_id = $1 AND status = 'success' AND size_bytes > 0
			ORDER BY completed_at DESC
			LIMIT 10
		) recent
	`, connectionID).Scan(&avg)
	if !avg.Valid {
		return 0
	}
	return int64(avg.Float64)
}

func (a *AnomalyDetector) SendAnomalyAlerts(connectionID int, connectionName, connectionType string, userID int, anomalies []Anomaly, emailCfg *notifications.EmailConfig) {
	if len(anomalies) == 0 {
		return
	}

	for _, anom := range anomalies {
		// Get user email
		var email string
		a.DB.QueryRow("SELECT email FROM users WHERE id = $1", userID).Scan(&email)

		// Slack
		var webhookURL string
		a.DB.QueryRow("SELECT value FROM settings WHERE user_id = $1 AND key = 'slack_webhook_url'", userID).Scan(&webhookURL)
		if webhookURL != "" {
			go notifications.SendSlackNotification(webhookURL, notifications.BackupNotification{
				ConnectionName: connectionName,
				ConnectionType: connectionType,
				Status:         "anomaly",
				ErrorMessage:   anom.Message,
			})
		}
	}
}
