package notifications

import (
	"bytes"
	"fmt"
	"log"
	"net/smtp"
	"os"
	"time"
)

type EmailConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
	Enabled  bool
}

func LoadEmailConfig() *EmailConfig {
	enabled := os.Getenv("NOTIFICATIONS_ENABLED") == "true"
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}

	return &EmailConfig{
		Host:     host,
		Port:     port,
		Username: os.Getenv("SMTP_USERNAME"),
		Password: os.Getenv("SMTP_PASSWORD"),
		From:     os.Getenv("SMTP_FROM"),
		Enabled:  enabled && host != "",
	}
}

type BackupNotification struct {
	ConnectionName string
	ConnectionType string
	Status         string
	SizeBytes      int64
	ErrorMessage   string
	Duration       time.Duration
	Timestamp      time.Time
}

func SendBackupNotification(cfg *EmailConfig, to string, n BackupNotification) {
	if !cfg.Enabled {
		return
	}

	dashboardURL := "https://getsnapbase.com/dashboard"

	var subject, plainText, htmlBody string

	if n.Status == "success" {
		subject = fmt.Sprintf("Backup successful — %s", n.ConnectionName)
		plainText = fmt.Sprintf(
			"Backup completed successfully.\n\nConnection: %s\nType: %s\nSize: %s\nDuration: %s\nTimestamp: %s\n",
			n.ConnectionName, n.ConnectionType, formatSize(n.SizeBytes),
			n.Duration.Round(time.Second).String(), n.Timestamp.Format(time.RFC1123),
		)
		if html, err := renderBackupSuccess(n, dashboardURL); err == nil {
			htmlBody = html
		}
	} else {
		subject = fmt.Sprintf("Backup failed — %s", n.ConnectionName)
		plainText = fmt.Sprintf(
			"Backup failed.\n\nConnection: %s\nType: %s\nError: %s\nTimestamp: %s\n",
			n.ConnectionName, n.ConnectionType, n.ErrorMessage, n.Timestamp.Format(time.RFC1123),
		)
		if html, err := renderBackupFailure(n, dashboardURL); err == nil {
			htmlBody = html
		}
	}

	sendEmail(cfg, to, subject, plainText, htmlBody)
}

func SendInviteEmail(cfg *EmailConfig, to string, data InviteEmailData) {
	if !cfg.Enabled {
		return
	}
	subject := fmt.Sprintf("You're invited to join %s on SnapBase", data.OrgName)
	plainText := fmt.Sprintf(
		"%s invited you to join %s as %s.\n\nAccept your invitation: %s\n\nThis link expires in 7 days.\n",
		data.InviterName, data.OrgName, data.Role, data.AcceptURL,
	)
	htmlBody := ""
	if html, err := RenderInviteEmail(data); err == nil {
		htmlBody = html
	}
	sendEmail(cfg, to, subject, plainText, htmlBody)
}

func sendEmail(cfg *EmailConfig, to, subject, plainText, htmlBody string) {
	const boundary = "===============snapbase_mime_boundary=="

	var msg bytes.Buffer
	msg.WriteString(fmt.Sprintf("From: %s\r\n", cfg.From))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")

	if htmlBody != "" {
		msg.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n", boundary))
		msg.WriteString("\r\n")
		// text/plain part
		msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
		msg.WriteString(plainText)
		msg.WriteString("\r\n")
		// text/html part
		msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
		msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n\r\n")
		msg.WriteString(htmlBody)
		msg.WriteString("\r\n")
		msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	} else {
		msg.WriteString("Content-Type: text/plain; charset=UTF-8\r\n\r\n")
		msg.WriteString(plainText)
	}

	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	err := smtp.SendMail(addr, auth, cfg.From, []string{to}, msg.Bytes())
	if err != nil {
		log.Printf("Failed to send email to %s: %v", to, err)
		return
	}
	log.Printf("Sent email to %s: %s", to, subject)
}

func formatSize(bytes int64) string {
	if bytes == 0 {
		return "0 B"
	}
	const k = 1024
	sizes := []string{"B", "KB", "MB", "GB"}
	i := 0
	size := float64(bytes)
	for size >= float64(k) && i < len(sizes)-1 {
		size /= float64(k)
		i++
	}
	return fmt.Sprintf("%.2f %s", size, sizes[i])
}
