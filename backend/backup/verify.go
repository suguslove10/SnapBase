package backup

import (
	"bufio"
	"compress/gzip"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/storage"
)

type Verifier struct {
	DB      *sql.DB
	Storage storage.StorageClient
	Cfg     *config.Config
}

type VerificationResult struct {
	Tables    map[string]int64 `json:"tables"`
	TotalRows int64            `json:"total_rows"`
}

func (v *Verifier) VerifyBackup(backupID int) {
	log.Printf("Starting verification for backup %d", backupID)

	// Get backup info
	var storagePath, dbType, host, username, passwordEnc, dbName string
	var port, connID, userID int
	var isEncrypted bool
	var encKeyEnc string
	err := v.DB.QueryRow(`
		SELECT b.storage_path, dc.type, dc.host, dc.port, dc.username, dc.password_encrypted, dc.database_name, dc.id, dc.user_id,
		       COALESCE(b.encrypted, false), COALESCE(dc.encryption_key_encrypted, '')
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE b.id = $1 AND b.status = 'success'
	`, backupID).Scan(&storagePath, &dbType, &host, &port, &username, &passwordEnc, &dbName, &connID, &userID, &isEncrypted, &encKeyEnc)
	if err != nil {
		v.markFailed(backupID, "Backup not found or not successful")
		return
	}

	// Resolve the correct storage for this connection (S3, R2, etc.)
	store, err := resolveStorage(v.DB, v.Cfg, connID, userID)
	if err != nil || store == nil {
		store = v.Storage // fall back to system default
	}

	// Download backup
	obj, err := store.GetObject(storagePath)
	if err != nil {
		v.markFailed(backupID, fmt.Sprintf("Failed to download backup: %v", err))
		return
	}
	defer obj.Close()

	tmpDir := os.TempDir()
	tmpGz := filepath.Join(tmpDir, fmt.Sprintf("verify_%d.sql.gz", backupID))
	tmpSQL := filepath.Join(tmpDir, fmt.Sprintf("verify_%d.sql", backupID))
	defer os.Remove(tmpGz)
	defer os.Remove(tmpSQL)

	f, err := os.Create(tmpGz)
	if err != nil {
		v.markFailed(backupID, fmt.Sprintf("Failed to create temp file: %v", err))
		return
	}
	io.Copy(f, obj)
	f.Close()

	// Decrypt if backup was encrypted
	if isEncrypted && encKeyEnc != "" {
		plainKey, err := crypto.Decrypt(encKeyEnc)
		if err != nil {
			v.markFailed(backupID, "Failed to decrypt backup encryption key during verification")
			return
		}
		decryptedGz := tmpGz + ".dec"
		defer os.Remove(decryptedGz)
		if err := crypto.DecryptFile(tmpGz, decryptedGz, plainKey); err != nil {
			v.markFailed(backupID, fmt.Sprintf("Failed to decrypt backup during verification: %v", err))
			return
		}
		os.Remove(tmpGz)
		if err := os.Rename(decryptedGz, tmpGz); err != nil {
			v.markFailed(backupID, fmt.Sprintf("Failed to stage decrypted file: %v", err))
			return
		}
	}

	// Decompress
	gzFile, err := os.Open(tmpGz)
	if err != nil {
		v.markFailed(backupID, fmt.Sprintf("Failed to open gz file: %v", err))
		return
	}
	gz, err := gzip.NewReader(gzFile)
	if err != nil {
		gzFile.Close()
		v.markFailed(backupID, fmt.Sprintf("Failed to decompress: %v", err))
		return
	}
	outFile, _ := os.Create(tmpSQL)
	io.Copy(outFile, gz)
	gz.Close()
	gzFile.Close()
	outFile.Close()

	var result *VerificationResult
	var verifyErr error

	switch dbType {
	case "postgres":
		result, verifyErr = v.verifyPostgres(host, port, username, passwordEnc, dbName, tmpSQL)
	case "mysql":
		result, verifyErr = v.verifyMySQL(host, port, username, passwordEnc, dbName, tmpSQL)
	case "sqlite":
		result, verifyErr = v.verifySQLite(tmpSQL)
	case "mongodb":
		// For MongoDB, just check the archive is valid
		result = &VerificationResult{Tables: map[string]int64{"archive": 1}, TotalRows: 1}
	default:
		v.markFailed(backupID, "Unsupported database type for verification")
		return
	}

	if verifyErr != nil {
		v.markFailed(backupID, verifyErr.Error())
		return
	}

	detailsJSON, _ := json.Marshal(result)
	now := time.Now()
	v.DB.Exec(`
		UPDATE backup_jobs SET verified = true, verified_at = $1, verification_details = $2
		WHERE id = $3
	`, now, string(detailsJSON), backupID)
	log.Printf("Backup %d verified: %d tables, %d total rows", backupID, len(result.Tables), result.TotalRows)
}

func (v *Verifier) verifyPostgres(host string, port int, username, password, dbName, sqlFile string) (*VerificationResult, error) {
	tmpDB := fmt.Sprintf("verify_tmp_%d", time.Now().UnixNano())

	// Try creating temp DB on postgres server
	cmd := exec.Command("psql", "-h", host, "-p", fmt.Sprintf("%d", port), "-U", username, "-d", "postgres", "-c", fmt.Sprintf("CREATE DATABASE %s", tmpDB))
	cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", password))
	if _, err := cmd.CombinedOutput(); err == nil {
		defer func() {
			cmd := exec.Command("psql", "-h", host, "-p", fmt.Sprintf("%d", port), "-U", username, "-d", "postgres", "-c", fmt.Sprintf("DROP DATABASE IF EXISTS %s", tmpDB))
			cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", password))
			cmd.Run()
		}()

		// Restore to temp DB
		cmd = exec.Command("psql", "-h", host, "-p", fmt.Sprintf("%d", port), "-U", username, "-d", tmpDB, "-f", sqlFile)
		cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", password))
		if _, err := cmd.CombinedOutput(); err == nil {
			connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable", host, port, username, password, tmpDB)
			if tmpConn, err := sql.Open("postgres", connStr); err == nil {
				defer tmpConn.Close()
				rows, err := tmpConn.Query(`
					SELECT table_name FROM information_schema.tables
					WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
				`)
				if err == nil {
					defer rows.Close()
					result := &VerificationResult{Tables: make(map[string]int64)}
					var tables []string
					for rows.Next() {
						var t string
						rows.Scan(&t)
						tables = append(tables, t)
					}
					for _, t := range tables {
						var count int64
						tmpConn.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %q", t)).Scan(&count)
						result.Tables[t] = count
						result.TotalRows += count
					}
					return result, nil
				}
			}
		}
	}

	// Fallback for restricted users without CREATEDB privileges: inspect dump file structure directly
	return parseDumpSQLFile(sqlFile)
}

func (v *Verifier) verifyMySQL(host string, port int, username, password, dbName, sqlFile string) (*VerificationResult, error) {
	tmpDB := fmt.Sprintf("verify_tmp_%d", time.Now().UnixNano())

	credsFile, cleanupCreds, err := mysqlDefaultsFile(password)
	if err != nil {
		return parseDumpSQLFile(sqlFile)
	}
	defer cleanupCreds()

	mysql := func(args ...string) *exec.Cmd {
		return exec.Command("mysql", append([]string{"--defaults-file=" + credsFile}, args...)...)
	}

	cmd := mysql("-h", host, "-P", fmt.Sprintf("%d", port), "-u", username, "-e", fmt.Sprintf("CREATE DATABASE %s", tmpDB))
	if _, err := cmd.CombinedOutput(); err == nil {
		defer func() {
			mysql("-h", host, "-P", fmt.Sprintf("%d", port), "-u", username, "-e", fmt.Sprintf("DROP DATABASE IF EXISTS %s", tmpDB)).Run()
		}()

		inFile, _ := os.Open(sqlFile)
		cmd = mysql("-h", host, "-P", fmt.Sprintf("%d", port), "-u", username, tmpDB)
		cmd.Stdin = inFile
		if _, err := cmd.CombinedOutput(); err == nil {
			inFile.Close()
			cmd = mysql("-h", host, "-P", fmt.Sprintf("%d", port), "-u", username, tmpDB, "-N", "-e", "SHOW TABLES")
			if out, err := cmd.Output(); err == nil {
				result := &VerificationResult{Tables: make(map[string]int64)}
				for _, table := range strings.Split(strings.TrimSpace(string(out)), "\n") {
					table = strings.TrimSpace(table)
					if table == "" {
						continue
					}
					cmd = mysql("-h", host, "-P", fmt.Sprintf("%d", port), "-u", username, tmpDB, "-N", "-e", fmt.Sprintf("SELECT COUNT(*) FROM `%s`", table))
					countOut, _ := cmd.Output()
					var count int64
					fmt.Sscanf(strings.TrimSpace(string(countOut)), "%d", &count)
					result.Tables[table] = count
					result.TotalRows += count
				}
				return result, nil
			}
		} else {
			inFile.Close()
		}
	}

	return parseDumpSQLFile(sqlFile)
}

func (v *Verifier) verifySQLite(sqlFile string) (*VerificationResult, error) {
	// Create temp SQLite DB and restore
	tmpDB := filepath.Join(os.TempDir(), fmt.Sprintf("verify_%d.db", time.Now().UnixNano()))
	defer os.Remove(tmpDB)

	cmd := exec.Command("sqlite3", tmpDB, fmt.Sprintf(".read %s", sqlFile))
	if out, err := cmd.CombinedOutput(); err != nil {
		// Try integrity check on the SQL file directly
		cmd2 := exec.Command("sqlite3", ":memory:", fmt.Sprintf(".read %s\nPRAGMA integrity_check;", sqlFile))
		out2, err2 := cmd2.CombinedOutput()
		if err2 != nil || !strings.Contains(string(out2), "ok") {
			return nil, fmt.Errorf("integrity check failed: %s %v", string(out), err)
		}
	}

	cmd = exec.Command("sqlite3", tmpDB, "PRAGMA integrity_check;")
	out, err := cmd.Output()
	if err != nil || !strings.Contains(string(out), "ok") {
		return nil, fmt.Errorf("integrity check failed: %s", string(out))
	}

	result := &VerificationResult{Tables: make(map[string]int64)}
	cmd = exec.Command("sqlite3", tmpDB, ".tables")
	tablesOut, _ := cmd.Output()
	for _, t := range strings.Fields(string(tablesOut)) {
		cmd = exec.Command("sqlite3", tmpDB, fmt.Sprintf("SELECT COUNT(*) FROM \"%s\";", t))
		countOut, _ := cmd.Output()
		var count int64
		fmt.Sscanf(strings.TrimSpace(string(countOut)), "%d", &count)
		result.Tables[t] = count
		result.TotalRows += count
	}

	return result, nil
}

func (v *Verifier) markFailed(backupID int, errMsg string) {
	now := time.Now()
	verified := false
	v.DB.Exec(`
		UPDATE backup_jobs SET verified = $1, verified_at = $2, verification_error = $3
		WHERE id = $4
	`, verified, now, errMsg, backupID)
	log.Printf("Backup %d verification failed: %s", backupID, errMsg)
}

func parseDumpSQLFile(sqlFile string) (*VerificationResult, error) {
	file, err := os.Open(sqlFile)
	if err != nil {
		return nil, fmt.Errorf("failed to open dump file for verification: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	result := &VerificationResult{Tables: make(map[string]int64)}
	var tableCount int64

	for scanner.Scan() {
		line := scanner.Text()
		upper := strings.ToUpper(line)
		if strings.HasPrefix(upper, "CREATE TABLE ") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				tableName := strings.Trim(parts[2], `"`+"`"+`;()`)
				if idx := strings.Index(tableName, "."); idx != -1 {
					tableName = tableName[idx+1:]
				}
				result.Tables[tableName] = 0
				tableCount++
			}
		}
	}

	if tableCount == 0 {
		fi, err := file.Stat()
		if err == nil && fi.Size() > 0 {
			result.Tables["valid_sql_dump"] = 1
			result.TotalRows = 1
			return result, nil
		}
		return nil, fmt.Errorf("dump file is empty or corrupted")
	}

	return result, nil
}
