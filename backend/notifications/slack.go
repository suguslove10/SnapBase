package notifications

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

type SlackMessage struct {
	Attachments []SlackAttachment `json:"attachments"`
}

type SlackAttachment struct {
	Color  string       `json:"color"`
	Blocks []SlackBlock `json:"blocks"`
}

type SlackBlock struct {
	Type string          `json:"type"`
	Text *SlackBlockText `json:"text,omitempty"`
}

type SlackBlockText struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func SendSlackNotification(webhookURL string, n BackupNotification) {
	if webhookURL == "" {
		return
	}

	var color, title, body string

	switch n.Status {
	case "success":
		color = "#10b981"
		title = fmt.Sprintf("Backup successful — %s", n.ConnectionName)
		body = fmt.Sprintf(
			"*Database:* %s (%s)\n*Size:* %s\n*Duration:* %s\n*Time:* %s",
			n.ConnectionName, n.ConnectionType,
			formatSize(n.SizeBytes),
			n.Duration.Round(time.Second).String(),
			n.Timestamp.Format(time.RFC1123),
		)
	case "failed":
		color = "#ef4444"
		title = fmt.Sprintf("Backup failed — %s", n.ConnectionName)
		body = fmt.Sprintf(
			"*Database:* %s (%s)\n*Error:* %s\n*Time:* %s",
			n.ConnectionName, n.ConnectionType,
			n.ErrorMessage,
			n.Timestamp.Format(time.RFC1123),
		)
	case "anomaly":
		color = "#f59e0b"
		title = fmt.Sprintf("Anomaly detected — %s", n.ConnectionName)
		body = fmt.Sprintf(
			"*Database:* %s (%s)\n*Alert:* %s\n*Time:* %s",
			n.ConnectionName, n.ConnectionType,
			n.ErrorMessage,
			n.Timestamp.Format(time.RFC1123),
		)
	default:
		return
	}

	msg := SlackMessage{
		Attachments: []SlackAttachment{
			{
				Color: color,
				Blocks: []SlackBlock{
					{Type: "section", Text: &SlackBlockText{Type: "mrkdwn", Text: fmt.Sprintf("*%s*", title)}},
					{Type: "section", Text: &SlackBlockText{Type: "mrkdwn", Text: body}},
				},
			},
		},
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal Slack message: %v", err)
		return
	}

	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		log.Printf("Failed to send Slack notification: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("Slack webhook returned status %d", resp.StatusCode)
	} else {
		log.Printf("Sent Slack notification: %s", title)
	}
}
