package backup

import (
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/models"
	"github.com/suguslove10/snapbase/notifications"
	"github.com/suguslove10/snapbase/storage"
	"github.com/suguslove10/snapbase/webhooks"
)

type Runner struct {
	DB              *sql.DB
	Cfg             *config.Config
	Storage         storage.StorageClient
	EmailConfig     *notifications.EmailConfig
	Verifier        *Verifier
	AnomalyDetector *AnomalyDetector
}

func (r *Runner) RunBackup(conn models.DBConnection, scheduleID *int) {
	now := time.Now()

	// Resolve storage provider for this connection
	connStorage := r.Storage
	if r.Cfg != nil {
		resolved, err := resolveStorage(r.DB, r.Cfg, conn.ID, conn.UserID)
		if err != nil {
			log.Printf("Failed to resolve storage for connection %d, using default: %v", conn.ID, err)
		} else {
			connStorage = resolved
		}
	}

	// Create backup job record
	var jobID int
	err := r.DB.QueryRow(
		"INSERT INTO backup_jobs (connection_id, schedule_id, status, started_at) VALUES ($1, $2, 'running', $3) RETURNING id",
		conn.ID, scheduleID, now,
	).Scan(&jobID)
	if err != nil {
		log.Printf("Failed to create backup job: %v", err)
		return
	}

	// Get user email for notifications
	var userEmail string
	r.DB.QueryRow("SELECT email FROM users WHERE id = $1", conn.UserID).Scan(&userEmail)

	// Get org ID for webhook delivery
	var orgID int
	r.DB.QueryRow("SELECT COALESCE(org_id, 0) FROM db_connections WHERE id = $1", conn.ID).Scan(&orgID)

	// Execute backup
	tmpFile, err := r.executeBackup(conn)
	if err != nil {
		r.failJob(jobID, err.Error())
		r.sendNotification(userEmail, conn, "failed", 0, err.Error(), time.Since(now))
		webhooks.DeliverWebhook(r.DB, orgID, "backup.failed", webhooks.BackupEventData{
			ConnectionName: conn.Name,
			DBType:         conn.Type,
			BackupID:       jobID,
		})
		return
	}
	defer os.Remove(tmpFile)

	// Check if encryption is enabled for this connection
	var encEnabled bool
	var encKeyEnc string
	r.DB.QueryRow(
		"SELECT COALESCE(encryption_enabled, false), COALESCE(encryption_key_encrypted, '') FROM db_connections WHERE id = $1",
		conn.ID,
	).Scan(&encEnabled, &encKeyEnc)

	uploadFile := tmpFile
	isEncrypted := false
	var encTmpFile string

	if encEnabled && encKeyEnc != "" {
		// Decrypt the stored key
		plainKey, err := crypto.Decrypt(encKeyEnc)
		if err != nil {
			r.failJob(jobID, "Failed to decrypt backup encryption key: "+err.Error())
			r.sendNotification(userEmail, conn, "failed", 0, err.Error(), time.Since(now))
			return
		}
		// Encrypt the backup file
		encTmpFile = tmpFile + ".enc"
		if err := crypto.EncryptFile(tmpFile, encTmpFile, plainKey); err != nil {
			r.failJob(jobID, "Failed to encrypt backup file: "+err.Error())
			r.sendNotification(userEmail, conn, "failed", 0, err.Error(), time.Since(now))
			return
		}
		defer os.Remove(encTmpFile)
		uploadFile = encTmpFile
		isEncrypted = true
	}

	// Get file info
	info, err := os.Stat(uploadFile)
	if err != nil {
		r.failJob(jobID, "Failed to stat backup file: "+err.Error())
		r.sendNotification(userEmail, conn, "failed", 0, err.Error(), time.Since(now))
		return
	}

	// Build storage path
	ext := getExtension(conn.Type)
	if isEncrypted {
		ext += ".enc"
	}
	storagePath := fmt.Sprintf("%d/%d/%s%s",
		conn.UserID, conn.ID, now.Format("2006-01-02T15-04-05"), ext)

	// Upload to storage
	file, err := os.Open(uploadFile)
	if err != nil {
		r.failJob(jobID, "Failed to open backup file: "+err.Error())
		r.sendNotification(userEmail, conn, "failed", 0, err.Error(), time.Since(now))
		return
	}
	defer file.Close()

	err = storage.UploadWithRetry(connStorage, storagePath, file, info.Size(), 3)
	if err != nil {
		r.failJob(jobID, "Failed to upload backup: "+err.Error())
		r.sendNotification(userEmail, conn, "failed", 0, err.Error(), time.Since(now))
		webhooks.DeliverWebhook(r.DB, orgID, "backup.failed", webhooks.BackupEventData{
			ConnectionName: conn.Name,
			DBType:         conn.Type,
			BackupID:       jobID,
		})
		return
	}

	// Mark success
	completed := time.Now()
	_, err = r.DB.Exec(
		"UPDATE backup_jobs SET status = 'success', size_bytes = $1, storage_path = $2, completed_at = $3, encrypted = $4 WHERE id = $5",
		info.Size(), storagePath, completed, isEncrypted, jobID,
	)
	if err != nil {
		log.Printf("Failed to update backup job: %v", err)
	}

	// Update schedule last_run if applicable
	if scheduleID != nil {
		r.DB.Exec("UPDATE schedules SET last_run = $1 WHERE id = $2", completed, *scheduleID)
	}

	log.Printf("Backup completed: job=%d connection=%s path=%s size=%d", jobID, conn.Name, storagePath, info.Size())
	r.sendNotification(userEmail, conn, "success", info.Size(), "", time.Since(now))
	webhooks.DeliverWebhook(r.DB, orgID, "backup.success", webhooks.BackupEventData{
		ConnectionName: conn.Name,
		DBType:         conn.Type,
		SizeBytes:      info.Size(),
		SizeFormatted:  webhooks.FormatSize(info.Size()),
		DurationMS:     time.Since(now).Milliseconds(),
		BackupID:       jobID,
	})

	// Run verification async
	if r.Verifier != nil {
		go r.Verifier.VerifyBackup(jobID)
	}

	// Anomaly detection
	if r.AnomalyDetector != nil {
		go func() {
			anomalies := r.AnomalyDetector.DetectAnomalies(conn.ID, jobID, info.Size())
			r.AnomalyDetector.SendAnomalyAlerts(conn.ID, conn.Name, conn.Type, conn.UserID, anomalies, r.EmailConfig)
		}()
	}
}

func (r *Runner) sendNotification(to string, conn models.DBConnection, status string, sizeBytes int64, errMsg string, dur time.Duration) {
	n := notifications.BackupNotification{
		ConnectionName: conn.Name,
		ConnectionType: conn.Type,
		Status:         status,
		SizeBytes:      sizeBytes,
		ErrorMessage:   errMsg,
		Duration:       dur,
		Timestamp:      time.Now(),
	}

	// Email
	if r.EmailConfig != nil && to != "" {
		go notifications.SendBackupNotification(r.EmailConfig, to, n)
	}

	// Slack — look up webhook from user settings
	var webhookURL string
	r.DB.QueryRow("SELECT value FROM settings WHERE user_id = $1 AND key = 'slack_webhook_url'", conn.UserID).Scan(&webhookURL)
	if webhookURL != "" {
		go notifications.SendSlackNotification(webhookURL, n)
	}
}

func (r *Runner) executeBackup(conn models.DBConnection) (string, error) {
	tmpFile, err := os.CreateTemp("", "backup-*")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	gzWriter := gzip.NewWriter(tmpFile)

	var cmd *exec.Cmd
	switch conn.Type {
	case "postgres":
		cmd = exec.Command("pg_dump",
			"-h", conn.Host,
			"-p", fmt.Sprintf("%d", conn.Port),
			"-U", conn.Username,
			"-d", conn.Database,
			"--no-password",
		)
		cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", conn.PasswordEncrypted))

	case "mysql":
		cmd = exec.Command("mysqldump",
			"-h", conn.Host,
			"-P", fmt.Sprintf("%d", conn.Port),
			"-u", conn.Username,
			fmt.Sprintf("-p%s", conn.PasswordEncrypted),
			conn.Database,
		)

	case "mongodb":
		authSource := "admin"
		if conn.AuthSource != "" {
			authSource = conn.AuthSource
		}
		var uri string
		// MongoDB Atlas uses SRV records (.mongodb.net) — must use mongodb+srv:// without port
		if strings.Contains(conn.Host, ".mongodb.net") {
			uri = fmt.Sprintf("mongodb+srv://%s:%s@%s/%s?authSource=%s",
				conn.Username, conn.PasswordEncrypted, conn.Host, conn.Database, authSource)
		} else {
			uri = fmt.Sprintf("mongodb://%s:%s@%s:%d/%s?authSource=%s",
				conn.Username, conn.PasswordEncrypted, conn.Host, conn.Port, conn.Database, authSource)
		}
		cmd = exec.Command("mongodump",
			"--uri", uri,
			"--archive",
		)

	case "sqlite":
		srcFile, err := os.Open(conn.Database)
		if err != nil {
			tmpFile.Close()
			os.Remove(tmpPath)
			return "", fmt.Errorf("failed to open sqlite file: %w", err)
		}
		_, err = io.Copy(gzWriter, srcFile)
		srcFile.Close()
		gzWriter.Close()
		tmpFile.Close()
		if err != nil {
			os.Remove(tmpPath)
			return "", fmt.Errorf("failed to compress sqlite file: %w", err)
		}
		return tmpPath, nil

	default:
		tmpFile.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("unsupported database type: %s", conn.Type)
	}

	cmd.Stdout = gzWriter
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		gzWriter.Close()
		tmpFile.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("backup command failed: %w", err)
	}

	gzWriter.Close()
	tmpFile.Close()
	return tmpPath, nil
}

func (r *Runner) failJob(jobID int, errMsg string) {
	log.Printf("Backup failed: job=%d error=%s", jobID, errMsg)
	now := time.Now()
	r.DB.Exec(
		"UPDATE backup_jobs SET status = 'failed', error_message = $1, completed_at = $2 WHERE id = $3",
		errMsg, now, jobID,
	)
}

func resolveStorage(db *sql.DB, cfg *config.Config, connID int, userID int) (storage.StorageClient, error) {
	var providerID sql.NullInt64
	db.QueryRow("SELECT storage_provider_id FROM db_connections WHERE id = $1", connID).Scan(&providerID)

	var query string
	var args []interface{}
	if providerID.Valid {
		query = "SELECT provider_type, COALESCE(endpoint,''), COALESCE(access_key,''), COALESCE(secret_key_encrypted,''), bucket, COALESCE(region,''), use_ssl FROM storage_providers WHERE id = $1"
		args = []interface{}{providerID.Int64}
	} else {
		query = "SELECT provider_type, COALESCE(endpoint,''), COALESCE(access_key,''), COALESCE(secret_key_encrypted,''), bucket, COALESCE(region,''), use_ssl FROM storage_providers WHERE user_id = $1 AND is_default = true"
		args = []interface{}{userID}
	}

	var pType, endpoint, accessKey, secretEnc, bucket, region string
	var useSSL bool
	err := db.QueryRow(query, args...).Scan(&pType, &endpoint, &accessKey, &secretEnc, &bucket, &region, &useSSL)
	if err != nil {
		// Fall back to system default
		return storage.NewStorageClient(storage.ProviderConfig{
			ProviderType: "minio",
			Endpoint:     cfg.MinioEndpoint,
			AccessKey:    cfg.MinioAccessKey,
			SecretKey:    cfg.MinioSecretKey,
			Bucket:       cfg.MinioBucket,
			UseSSL:       cfg.MinioUseSSL,
		})
	}

	// Decrypt the secret key — user-added providers encrypt it with JWT secret
	secretKey := decryptProviderSecret(secretEnc, cfg.JWTSecret)

	return storage.NewStorageClient(storage.ProviderConfig{
		ProviderType: pType,
		Endpoint:     endpoint,
		AccessKey:    accessKey,
		SecretKey:    secretKey,
		Bucket:       bucket,
		Region:       region,
		UseSSL:       useSSL,
	})
}

// decryptProviderSecret decrypts a storage provider secret key using the JWT secret as AES key.
// MUST use zero-padding (first 32 bytes of JWT secret, padded with 0x00) to match
// encryptSecret in handlers/storage_providers.go which uses the same deriveKey method.
// Falls back to returning the raw value if decryption fails (e.g. seeded MinIO plain-text).
func decryptProviderSecret(encrypted, jwtSecret string) string {
	// Derive key using the same method as encryptSecret in storage_providers.go
	key := []byte(jwtSecret)
	if len(key) > 32 {
		key = key[:32]
	}
	for len(key) < 32 {
		key = append(key, 0)
	}
	data, err := hex.DecodeString(encrypted)
	if err != nil {
		return encrypted
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return encrypted
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return encrypted
	}
	nonceSize := aesGCM.NonceSize()
	if len(data) < nonceSize {
		return encrypted
	}
	plaintext, err := aesGCM.Open(nil, data[:nonceSize], data[nonceSize:], nil)
	if err != nil {
		return encrypted
	}
	return string(plaintext)
}

func getExtension(dbType string) string {
	switch dbType {
	case "postgres", "mysql":
		return ".sql.gz"
	case "mongodb":
		return ".archive.gz"
	case "sqlite":
		return ".db.gz"
	default:
		return ".gz"
	}
}
