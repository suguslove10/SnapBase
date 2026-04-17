package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/smtp"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/notifications"
	"github.com/suguslove10/snapbase/storage"
)

type SettingsHandler struct {
	DB      *sql.DB
	Cfg     *config.Config
	Storage storage.StorageClient
}

// ChangePassword handles PATCH /api/auth/password
func (h *SettingsHandler) ChangePassword(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if len(req.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
		return
	}

	var currentHash string
	err := h.DB.QueryRow("SELECT password_hash FROM users WHERE id = $1", userID).Scan(&currentHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Current password is incorrect"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	_, err = h.DB.Exec("UPDATE users SET password_hash = $1 WHERE id = $2", string(newHash), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password updated successfully"})
}

// GetNotificationSettings handles GET /api/settings/notifications
func (h *SettingsHandler) GetNotificationSettings(c *gin.Context) {
	userID := c.GetInt("user_id")

	keys := []string{"smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from", "notifications_enabled", "slack_webhook_url", "discord_webhook_url"}
	settings := make(map[string]string)

	for _, key := range keys {
		var val string
		err := h.DB.QueryRow("SELECT value FROM settings WHERE user_id = $1 AND key = $2", userID, key).Scan(&val)
		if err == nil {
			settings[key] = val
		}
	}

	// Mask password
	if pw, ok := settings["smtp_password"]; ok && len(pw) > 0 {
		settings["smtp_password"] = "••••••••"
	}

	c.JSON(http.StatusOK, settings)
}

// UpdateNotificationSettings handles PATCH /api/settings/notifications
func (h *SettingsHandler) UpdateNotificationSettings(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		SMTPHost          string `json:"smtp_host"`
		SMTPPort          string `json:"smtp_port"`
		SMTPUser          string `json:"smtp_username"`
		SMTPPass          string `json:"smtp_password"`
		SMTPFrom          string `json:"smtp_from"`
		Enabled           bool   `json:"enabled"`
		SlackWebhookURL   string `json:"slack_webhook_url"`
		DiscordWebhookURL string `json:"discord_webhook_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	updates := map[string]string{
		"smtp_host":             req.SMTPHost,
		"smtp_port":             req.SMTPPort,
		"smtp_username":         req.SMTPUser,
		"smtp_from":             req.SMTPFrom,
		"notifications_enabled": fmt.Sprintf("%t", req.Enabled),
		"slack_webhook_url":     req.SlackWebhookURL,
		"discord_webhook_url":   req.DiscordWebhookURL,
	}
	// Only update password if it's not the masked value
	if req.SMTPPass != "" && req.SMTPPass != "••••••••" {
		updates["smtp_password"] = req.SMTPPass
	}

	for key, val := range updates {
		_, err := h.DB.Exec(`
			INSERT INTO settings (user_id, key, value, updated_at)
			VALUES ($1, $2, $3, NOW())
			ON CONFLICT (user_id, key)
			DO UPDATE SET value = $3, updated_at = NOW()
		`, userID, key, val)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save settings"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification settings saved"})
}

// TestNotification handles POST /api/settings/notifications/test
func (h *SettingsHandler) TestNotification(c *gin.Context) {
	userID := c.GetInt("user_id")
	email := c.GetString("email")

	keys := []string{"smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from"}
	settings := make(map[string]string)
	for _, key := range keys {
		var val string
		err := h.DB.QueryRow("SELECT value FROM settings WHERE user_id = $1 AND key = $2", userID, key).Scan(&val)
		if err == nil {
			settings[key] = val
		}
	}

	host := settings["smtp_host"]
	port := settings["smtp_port"]
	if port == "" {
		port = "587"
	}
	from := settings["smtp_from"]

	if host == "" || from == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SMTP not configured. Save settings first."})
		return
	}

	subject := "SnapBase — Test Notification"
	body := "This is a test email from SnapBase. If you received this, your notification settings are working correctly."
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		from, email, subject, body)

	addr := fmt.Sprintf("%s:%s", host, port)
	auth := smtp.PlainAuth("", settings["smtp_username"], settings["smtp_password"], host)

	err := smtp.SendMail(addr, auth, from, []string{email}, []byte(msg))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to send test email: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Test email sent successfully"})
}

// GetStorageInfo handles GET /api/settings/storage
func (h *SettingsHandler) GetStorageInfo(c *gin.Context) {
	userID := c.GetInt("user_id")

	var totalBackups int
	var storageUsed int64
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1`, userID).Scan(&totalBackups)

	h.DB.QueryRow(`
		SELECT COALESCE(SUM(b.size_bytes), 0) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.status = 'success'`, userID).Scan(&storageUsed)

	// Per-connection breakdown
	type connUsage struct {
		ID          int    `json:"id"`
		Name        string `json:"name"`
		DBType      string `json:"db_type"`
		BackupCount int    `json:"backup_count"`
		SizeBytes   int64  `json:"size_bytes"`
		LastBackup  string `json:"last_backup"`
	}
	rows, _ := h.DB.Query(`
		SELECT dc.id, dc.name, dc.type,
			COUNT(b.id),
			COALESCE(SUM(b.size_bytes), 0),
			COALESCE(MAX(b.started_at)::text, '')
		FROM db_connections dc
		LEFT JOIN backup_jobs b ON b.connection_id = dc.id AND b.status = 'success'
		WHERE dc.user_id = $1
		GROUP BY dc.id, dc.name, dc.type
		ORDER BY COALESCE(SUM(b.size_bytes), 0) DESC`, userID)
	var byConnection []connUsage
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var cu connUsage
			rows.Scan(&cu.ID, &cu.Name, &cu.DBType, &cu.BackupCount, &cu.SizeBytes, &cu.LastBackup)
			byConnection = append(byConnection, cu)
		}
	}
	if byConnection == nil {
		byConnection = []connUsage{}
	}

	plan := getUserPlan(h.DB, userID)
	storageLimit := GetStorageLimit(plan)

	c.JSON(http.StatusOK, gin.H{
		"total_backups":  totalBackups,
		"storage_used":   storageUsed,
		"storage_limit":  storageLimit,
		"plan":           plan,
		"by_connection":  byConnection,
		"minio_endpoint": h.Cfg.MinioEndpoint,
		"bucket":         h.Cfg.MinioBucket,
	})
}

// TestSlack handles POST /api/settings/slack/test
func (h *SettingsHandler) TestSlack(c *gin.Context) {
	userID := c.GetInt("user_id")

	var webhookURL string
	err := h.DB.QueryRow("SELECT value FROM settings WHERE user_id = $1 AND key = 'slack_webhook_url'", userID).Scan(&webhookURL)
	if err != nil || webhookURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Slack webhook URL not configured. Save settings first."})
		return
	}

	notifications.SendSlackNotification(webhookURL, notifications.BackupNotification{
		ConnectionName: "Test Database",
		ConnectionType: "postgres",
		Status:         "success",
		SizeBytes:      1024 * 1024,
		Duration:       5 * time.Second,
		Timestamp:      time.Now(),
	})

	c.JSON(http.StatusOK, gin.H{"message": "Test Slack message sent"})
}

// TestDiscord handles POST /api/settings/discord/test
func (h *SettingsHandler) TestDiscord(c *gin.Context) {
	userID := c.GetInt("user_id")

	var webhookURL string
	err := h.DB.QueryRow("SELECT value FROM settings WHERE user_id = $1 AND key = 'discord_webhook_url'", userID).Scan(&webhookURL)
	if err != nil || webhookURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Discord webhook URL not configured. Save settings first."})
		return
	}

	notifications.SendDiscordNotification(webhookURL, notifications.BackupNotification{
		ConnectionName: "Test Database",
		ConnectionType: "postgres",
		Status:         "success",
		SizeBytes:      1024 * 1024,
		Duration:       5 * time.Second,
		Timestamp:      time.Now(),
	})

	c.JSON(http.StatusOK, gin.H{"message": "Test Discord message sent"})
}
