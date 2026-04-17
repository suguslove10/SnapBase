package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// Discord webhook uses "embeds" format.
type discordWebhookPayload struct {
	Embeds []discordEmbed `json:"embeds"`
}

type discordEmbed struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Color       int    `json:"color"` // decimal RGB
}

// SendDiscordNotification sends a backup notification to a Discord webhook URL.
func SendDiscordNotification(webhookURL string, n BackupNotification) {
	if webhookURL == "" {
		return
	}

	var color int
	var title, desc string

	switch n.Status {
	case "success":
		color = 0x10b981 // green
		title = fmt.Sprintf("✅ Backup successful — %s", n.ConnectionName)
		desc = fmt.Sprintf(
			"**Database:** %s (%s)\n**Size:** %s\n**Duration:** %s\n**Time:** %s",
			n.ConnectionName, n.ConnectionType,
			formatSize(n.SizeBytes),
			n.Duration.Round(time.Second).String(),
			n.Timestamp.Format(time.RFC1123),
		)
	case "failed":
		color = 0xef4444 // red
		title = fmt.Sprintf("❌ Backup failed — %s", n.ConnectionName)
		desc = fmt.Sprintf(
			"**Database:** %s (%s)\n**Error:** %s\n**Time:** %s",
			n.ConnectionName, n.ConnectionType,
			n.ErrorMessage,
			n.Timestamp.Format(time.RFC1123),
		)
	case "anomaly":
		color = 0xf59e0b // amber
		title = fmt.Sprintf("⚠️ Anomaly detected — %s", n.ConnectionName)
		desc = fmt.Sprintf(
			"**Database:** %s (%s)\n**Alert:** %s\n**Time:** %s",
			n.ConnectionName, n.ConnectionType,
			n.ErrorMessage,
			n.Timestamp.Format(time.RFC1123),
		)
	default:
		return
	}

	payload := discordWebhookPayload{
		Embeds: []discordEmbed{{Title: title, Description: desc, Color: color}},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Discord: failed to marshal payload: %v", err)
		return
	}

	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("Discord: failed to send notification: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("Discord webhook returned status %d", resp.StatusCode)
	} else {
		log.Printf("Sent Discord notification: %s", title)
	}
}
