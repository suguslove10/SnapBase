package notifications

import (
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

	var subject, body string

	if n.Status == "success" {
		subject = fmt.Sprintf("Backup successful — %s", n.ConnectionName)
		body = fmt.Sprintf(
			"Backup completed successfully.\n\n"+
				"Connection: %s\n"+
				"Type: %s\n"+
				"Size: %s\n"+
				"Duration: %s\n"+
				"Timestamp: %s\n",
			n.ConnectionName,
			n.ConnectionType,
			formatSize(n.SizeBytes),
			n.Duration.Round(time.Second).String(),
			n.Timestamp.Format(time.RFC1123),
		)
	} else {
		subject = fmt.Sprintf("Backup failed — %s", n.ConnectionName)
		body = fmt.Sprintf(
			"Backup failed.\n\n"+
				"Connection: %s\n"+
				"Type: %s\n"+
				"Error: %s\n"+
				"Timestamp: %s\n",
			n.ConnectionName,
			n.ConnectionType,
			n.ErrorMessage,
			n.Timestamp.Format(time.RFC1123),
		)
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		cfg.From, to, subject, body)

	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	err := smtp.SendMail(addr, auth, cfg.From, []string{to}, []byte(msg))
	if err != nil {
		log.Printf("Failed to send notification email to %s: %v", to, err)
		return
	}
	log.Printf("Sent backup notification to %s: %s", to, subject)
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
