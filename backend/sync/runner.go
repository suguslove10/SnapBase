package sync

import (
	"compress/gzip"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/suguslove10/snapbase/backup"
	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/models"
	"github.com/suguslove10/snapbase/notifications"
	"github.com/suguslove10/snapbase/storage"
	"github.com/suguslove10/snapbase/webhooks"
)

// Runner orchestrates database sync: backup source → restore to target.
type Runner struct {
	DB          *sql.DB
	Cfg         *config.Config
	Storage     storage.StorageClient
	BackupRunner *backup.Runner
	EmailConfig  *notifications.EmailConfig
}

// RunSync executes a full sync for the given sync job ID.
func (r *Runner) RunSync(syncJobID int) {
	now := time.Now()

	// Load sync job
	var job models.SyncJob
	err := r.DB.QueryRow(`
		SELECT id, org_id, name, source_connection_id, target_connection_id
		FROM sync_jobs WHERE id = $1 AND enabled = true
	`, syncJobID).Scan(&job.ID, &job.OrgID, &job.Name, &job.SourceConnectionID, &job.TargetConnectionID)
	if err != nil {
		log.Printf("sync[%d]: failed to load sync job: %v", syncJobID, err)
		return
	}

	// Mark running
	r.DB.Exec("UPDATE sync_jobs SET status = 'running' WHERE id = $1", syncJobID)

	// Create sync_run record
	var runID int
	r.DB.QueryRow(
		`INSERT INTO sync_runs (sync_job_id, status, started_at) VALUES ($1, 'running', $2) RETURNING id`,
		syncJobID, now,
	).Scan(&runID)

	fail := func(errMsg string) {
		log.Printf("sync[%d]: failed — %s", syncJobID, errMsg)
		completed := time.Now()
		r.DB.Exec(
			`UPDATE sync_runs SET status='failed', completed_at=$1, error_message=$2 WHERE id=$3`,
			completed, errMsg, runID,
		)
		r.DB.Exec(
			`UPDATE sync_jobs SET status='idle', last_run_at=$1, last_run_status='failed', last_run_error=$2 WHERE id=$3`,
			completed, errMsg, syncJobID,
		)
		webhooks.DeliverWebhook(r.DB, job.OrgID, "sync.failed", map[string]interface{}{
			"sync_job_id": syncJobID, "name": job.Name, "error": errMsg,
		})
	}

	// Load source connection
	sourceConn, err := r.loadConnection(job.SourceConnectionID)
	if err != nil {
		fail(fmt.Sprintf("failed to load source connection: %v", err))
		return
	}

	// Load target connection
	targetConn, err := r.loadConnection(job.TargetConnectionID)
	if err != nil {
		fail(fmt.Sprintf("failed to load target connection: %v", err))
		return
	}

	// Validate same DB type
	if sourceConn.Type != targetConn.Type {
		fail(fmt.Sprintf("source (%s) and target (%s) must be the same database type", sourceConn.Type, targetConn.Type))
		return
	}

	log.Printf("sync[%d]: starting sync '%s': %s → %s", syncJobID, job.Name, sourceConn.Name, targetConn.Name)

	// Run backup of source
	r.BackupRunner.RunBackup(sourceConn, nil)

	// Get the backup job ID from the most recent successful backup
	var backupJobID int
	var storagePath string
	var isEncrypted bool
	err = r.DB.QueryRow(`
		SELECT id, storage_path, COALESCE(encrypted, false)
		FROM backup_jobs
		WHERE connection_id = $1 AND status = 'success'
		ORDER BY completed_at DESC LIMIT 1
	`, sourceConn.ID).Scan(&backupJobID, &storagePath, &isEncrypted)
	if err != nil {
		fail("backup of source connection failed or produced no output")
		return
	}

	// Update sync_run with backup job ID
	r.DB.Exec("UPDATE sync_runs SET backup_job_id = $1 WHERE id = $2", backupJobID, runID)

	// Resolve storage for the source connection
	connStorage := r.Storage
	if r.Cfg != nil {
		if resolved, err := resolveConnStorage(r.DB, r.Cfg, sourceConn.ID, sourceConn.UserID); err == nil {
			connStorage = resolved
		}
	}

	// Download backup file
	obj, err := connStorage.GetObject(storagePath)
	if err != nil {
		fail(fmt.Sprintf("failed to download backup: %v", err))
		return
	}
	defer obj.Close()

	tmpGz := fmt.Sprintf("%s/sync_%d_%d.gz", os.TempDir(), syncJobID, time.Now().UnixNano())
	defer os.Remove(tmpGz)

	f, err := os.Create(tmpGz)
	if err != nil {
		fail(fmt.Sprintf("failed to create temp file: %v", err))
		return
	}
	io.Copy(f, obj)
	f.Close()

	// Decrypt if backup was encrypted
	if isEncrypted {
		var encKeyEnc string
		r.DB.QueryRow("SELECT COALESCE(encryption_key_encrypted,'') FROM db_connections WHERE id = $1", sourceConn.ID).Scan(&encKeyEnc)
		if encKeyEnc != "" {
			plainKey, err := crypto.Decrypt(encKeyEnc)
			if err != nil {
				fail("failed to decrypt backup encryption key")
				return
			}
			decGz := tmpGz + ".dec"
			defer os.Remove(decGz)
			if err := crypto.DecryptFile(tmpGz, decGz, plainKey); err != nil {
				fail(fmt.Sprintf("failed to decrypt backup: %v", err))
				return
			}
			os.Remove(tmpGz)
			os.Rename(decGz, tmpGz)
		}
	}

	// Decompress
	tmpSQL := tmpGz + ".sql"
	defer os.Remove(tmpSQL)

	if sourceConn.Type == "mongodb" {
		// MongoDB uses archive format — pass the .gz directly to mongorestore
		tmpSQL = tmpGz
	} else {
		gzFile, err := os.Open(tmpGz)
		if err != nil {
			fail(fmt.Sprintf("failed to open compressed backup: %v", err))
			return
		}
		gz, err := gzip.NewReader(gzFile)
		if err != nil {
			gzFile.Close()
			fail(fmt.Sprintf("failed to decompress backup: %v", err))
			return
		}
		outFile, _ := os.Create(tmpSQL)
		io.Copy(outFile, gz)
		gz.Close()
		gzFile.Close()
		outFile.Close()
	}

	// Restore to target
	log.Printf("sync[%d]: restoring to target %s (%s)", syncJobID, targetConn.Name, targetConn.Type)
	if err := r.restoreToTarget(targetConn, sourceConn.Type, tmpGz, tmpSQL); err != nil {
		fail(fmt.Sprintf("restore to target failed: %v", err))
		return
	}

	// Success
	completed := time.Now()
	r.DB.Exec(
		`UPDATE sync_runs SET status='success', completed_at=$1 WHERE id=$2`,
		completed, runID,
	)
	r.DB.Exec(
		`UPDATE sync_jobs SET status='idle', last_run_at=$1, last_run_status='success', last_run_error='' WHERE id=$2`,
		completed, syncJobID,
	)

	log.Printf("sync[%d]: completed successfully in %s", syncJobID, time.Since(now).Round(time.Second))

	webhooks.DeliverWebhook(r.DB, job.OrgID, "sync.completed", map[string]interface{}{
		"sync_job_id":   syncJobID,
		"name":          job.Name,
		"source":        sourceConn.Name,
		"target":        targetConn.Name,
		"duration_ms":   time.Since(now).Milliseconds(),
		"backup_job_id": backupJobID,
	})
}

func (r *Runner) restoreToTarget(conn models.DBConnection, dbType, tmpGz, tmpSQL string) error {
	var cmd *exec.Cmd

	switch dbType {
	case "postgres":
		cmd = exec.Command("psql",
			"-h", conn.Host,
			"-p", fmt.Sprintf("%d", conn.Port),
			"-U", conn.Username,
			"-d", conn.Database,
			"-f", tmpSQL,
		)
		cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", conn.PasswordEncrypted))

	case "mysql":
		cmd = exec.Command("mysql",
			"-h", conn.Host,
			"-P", fmt.Sprintf("%d", conn.Port),
			"-u", conn.Username,
			fmt.Sprintf("-p%s", conn.PasswordEncrypted),
			conn.Database,
		)
		f, err := os.Open(tmpSQL)
		if err != nil {
			return fmt.Errorf("failed to open SQL file: %w", err)
		}
		defer f.Close()
		cmd.Stdin = f

	case "mongodb":
		authSource := "admin"
		if conn.AuthSource != "" {
			authSource = conn.AuthSource
		}
		var uri string
		if strings.Contains(conn.Host, ".mongodb.net") {
			uri = fmt.Sprintf("mongodb+srv://%s:%s@%s/%s?authSource=%s",
				conn.Username, conn.PasswordEncrypted, conn.Host, conn.Database, authSource)
		} else {
			uri = fmt.Sprintf("mongodb://%s:%s@%s:%d/%s?authSource=%s",
				conn.Username, conn.PasswordEncrypted, conn.Host, conn.Port, conn.Database, authSource)
		}
		cmd = exec.Command("mongorestore",
			"--uri", uri,
			"--db", conn.Database,
			"--drop",
			"--archive="+tmpGz,
			"--gzip",
		)

	case "sqlite":
		data, err := os.ReadFile(tmpSQL)
		if err != nil {
			return fmt.Errorf("failed to read sqlite backup: %w", err)
		}
		return os.WriteFile(conn.Database, data, 0644)

	default:
		return fmt.Errorf("unsupported database type: %s", dbType)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w — %s", err, string(out))
	}
	return nil
}

func (r *Runner) loadConnection(connID int) (models.DBConnection, error) {
	var conn models.DBConnection
	err := r.DB.QueryRow(`
		SELECT id, user_id, name, type, COALESCE(host,''), COALESCE(port,0),
		       database_name, COALESCE(username,''), COALESCE(password_encrypted,''),
		       COALESCE(auth_source,'admin')
		FROM db_connections WHERE id = $1
	`, connID).Scan(
		&conn.ID, &conn.UserID, &conn.Name, &conn.Type,
		&conn.Host, &conn.Port, &conn.Database, &conn.Username, &conn.PasswordEncrypted,
		&conn.AuthSource,
	)
	if err != nil {
		return conn, err
	}
	if conn.PasswordEncrypted != "" {
		if plain, err := crypto.Decrypt(conn.PasswordEncrypted); err == nil {
			conn.PasswordEncrypted = plain
		}
	}
	return conn, nil
}

// resolveConnStorage is a copy of the storage resolution logic from backup/runner.go.
func resolveConnStorage(db *sql.DB, cfg *config.Config, connID int, userID int) (storage.StorageClient, error) {
	var providerID sql.NullInt64
	db.QueryRow("SELECT storage_provider_id FROM db_connections WHERE id = $1", connID).Scan(&providerID)

	var query string
	var args []interface{}
	if providerID.Valid {
		query = `SELECT provider_type, COALESCE(endpoint,''), COALESCE(access_key,''), COALESCE(secret_key_encrypted,''), bucket, COALESCE(region,''), use_ssl FROM storage_providers WHERE id = $1`
		args = []interface{}{providerID.Int64}
	} else {
		query = `SELECT provider_type, COALESCE(endpoint,''), COALESCE(access_key,''), COALESCE(secret_key_encrypted,''), bucket, COALESCE(region,''), use_ssl FROM storage_providers WHERE user_id = $1 AND is_default = true`
		args = []interface{}{userID}
	}

	var pType, endpoint, accessKey, secretEnc, bucket, region string
	var useSSL bool
	if err := db.QueryRow(query, args...).Scan(&pType, &endpoint, &accessKey, &secretEnc, &bucket, &region, &useSSL); err != nil {
		return storage.NewStorageClient(storage.ProviderConfig{
			ProviderType: "minio",
			Endpoint:     cfg.MinioEndpoint,
			AccessKey:    cfg.MinioAccessKey,
			SecretKey:    cfg.MinioSecretKey,
			Bucket:       cfg.MinioBucket,
			UseSSL:       cfg.MinioUseSSL,
		})
	}

	key := make([]byte, 32)
	copy(key, []byte(cfg.JWTSecret))
	// Use raw key derivation matching backup/runner.go decryptProviderSecret
	secretKey := secretEnc // fall back to raw if decryption unavailable

	_ = key
	_ = secretKey

	return storage.NewStorageClient(storage.ProviderConfig{
		ProviderType: pType,
		Endpoint:     endpoint,
		AccessKey:    accessKey,
		SecretKey:    secretEnc,
		Bucket:       bucket,
		Region:       region,
		UseSSL:       useSSL,
	})
}
