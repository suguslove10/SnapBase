package backup

import (
	"bufio"
	"compress/gzip"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/storage"
)

type RestoreRunner struct {
	DB      *sql.DB
	Storage storage.StorageClient
}

type RestoreEvent struct {
	Type    string `json:"type"`    // log, error, complete
	Message string `json:"message"`
}

func (r *RestoreRunner) Restore(backupID int, userID int, events chan<- RestoreEvent) {
	defer close(events)

	send := func(t, msg string) {
		events <- RestoreEvent{Type: t, Message: msg}
	}

	// Get backup info
	var storagePath, dbType, host, username, passwordEnc, dbName string
	var port int
	err := r.DB.QueryRow(`
		SELECT b.storage_path, dc.type, dc.host, dc.port, dc.username, dc.password_encrypted, dc.database_name
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE b.id = $1 AND dc.user_id = $2 AND b.status = 'success'
	`, backupID, userID).Scan(&storagePath, &dbType, &host, &port, &username, &passwordEnc, &dbName)
	if err != nil {
		send("error", "Backup not found or not eligible for restore")
		return
	}

	// SECURITY: decrypt password in memory only — never logged or returned to frontend
	if passwordEnc != "" {
		if plain, decErr := crypto.Decrypt(passwordEnc); decErr == nil {
			passwordEnc = plain
		}
	}

	// Update restore status
	r.DB.Exec("UPDATE backup_jobs SET restore_status = 'running' WHERE id = $1", backupID)
	send("log", fmt.Sprintf("Starting restore for %s database: %s", dbType, dbName))

	// Download backup from MinIO
	send("log", "Downloading backup from storage...")
	obj, err := r.Storage.GetObject(storagePath)
	if err != nil {
		send("error", fmt.Sprintf("Failed to download backup: %v", err))
		r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
		return
	}
	defer obj.Close()

	// Write to temp file
	tmpDir := os.TempDir()
	tmpGz := filepath.Join(tmpDir, fmt.Sprintf("restore_%d.sql.gz", backupID))
	tmpSQL := filepath.Join(tmpDir, fmt.Sprintf("restore_%d.sql", backupID))
	defer os.Remove(tmpGz)
	defer os.Remove(tmpSQL)

	f, err := os.Create(tmpGz)
	if err != nil {
		send("error", fmt.Sprintf("Failed to create temp file: %v", err))
		r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
		return
	}
	io.Copy(f, obj)
	f.Close()

	// Decompress
	send("log", "Decompressing backup file...")
	gzFile, err := os.Open(tmpGz)
	if err != nil {
		send("error", fmt.Sprintf("Failed to open compressed file: %v", err))
		r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
		return
	}
	gz, err := gzip.NewReader(gzFile)
	if err != nil {
		gzFile.Close()
		send("error", fmt.Sprintf("Failed to decompress: %v", err))
		r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
		return
	}
	outFile, _ := os.Create(tmpSQL)
	io.Copy(outFile, gz)
	gz.Close()
	gzFile.Close()
	outFile.Close()

	send("log", "Backup decompressed successfully")

	// Execute restore based on DB type
	var cmd *exec.Cmd
	switch dbType {
	case "postgres":
		send("log", fmt.Sprintf("Restoring PostgreSQL database %s on %s:%d...", dbName, host, port))
		cmd = exec.Command("psql",
			"-h", host,
			"-p", fmt.Sprintf("%d", port),
			"-U", username,
			"-d", dbName,
			"-f", tmpSQL,
		)
		cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", passwordEnc))

	case "mysql":
		send("log", fmt.Sprintf("Restoring MySQL database %s on %s:%d...", dbName, host, port))
		cmd = exec.Command("mysql",
			"-h", host,
			"-P", fmt.Sprintf("%d", port),
			"-u", username,
			fmt.Sprintf("-p%s", passwordEnc),
			dbName,
		)
		stdinFile, _ := os.Open(tmpSQL)
		cmd.Stdin = stdinFile
		defer stdinFile.Close()

	case "mongodb":
		send("log", fmt.Sprintf("Restoring MongoDB database %s...", dbName))
		var mongoURI string
		if strings.Contains(host, ".mongodb.net") {
			mongoURI = fmt.Sprintf("mongodb+srv://%s:%s@%s/%s?authSource=admin", username, passwordEnc, host, dbName)
		} else {
			mongoURI = fmt.Sprintf("mongodb://%s:%s@%s:%d/%s", username, passwordEnc, host, port, dbName)
		}
		cmd = exec.Command("mongorestore",
			"--uri", mongoURI,
			"--db", dbName,
			"--drop",
			"--archive="+tmpGz,
			"--gzip",
		)

	case "sqlite":
		send("log", fmt.Sprintf("Restoring SQLite database %s...", dbName))
		// For SQLite, just copy the file
		input, err := os.ReadFile(tmpSQL)
		if err != nil {
			send("error", fmt.Sprintf("Failed to read backup: %v", err))
			r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
			return
		}
		if err := os.WriteFile(dbName, input, 0644); err != nil {
			send("error", fmt.Sprintf("Failed to write database: %v", err))
			r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
			return
		}
		send("log", "SQLite database restored successfully")
		now := time.Now()
		r.DB.Exec("UPDATE backup_jobs SET restore_status = 'success', restored_at = $1 WHERE id = $2", now, backupID)
		send("complete", "Restore completed successfully")
		return

	default:
		send("error", fmt.Sprintf("Unsupported database type: %s", dbType))
		r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
		return
	}

	// Execute command and stream output
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		send("error", fmt.Sprintf("Failed to start restore: %v", err))
		r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
		return
	}

	// Stream stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			send("log", scanner.Text())
		}
	}()

	// Stream stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			send("log", line)
		}
	}()

	if err := cmd.Wait(); err != nil {
		send("error", fmt.Sprintf("Restore failed: %v", err))
		r.DB.Exec("UPDATE backup_jobs SET restore_status = 'failed' WHERE id = $1", backupID)
		return
	}

	now := time.Now()
	r.DB.Exec("UPDATE backup_jobs SET restore_status = 'success', restored_at = $1 WHERE id = $2", now, backupID)
	send("complete", "Restore completed successfully")
	log.Printf("Restore completed for backup %d", backupID)
}
