package handlers

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/backup"
	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/models"
	"github.com/suguslove10/snapbase/storage"
)

type BackupHandler struct {
	DB            *sql.DB
	Storage       storage.StorageClient
	Cfg           *config.Config
	Runner        *backup.Runner
	RestoreRunner *backup.RestoreRunner
	AuditLogger   interface{ LogAction(int, string, string, int, map[string]interface{}, string) }
}

func (h *BackupHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	rows, err := h.DB.Query(`
		SELECT b.id, b.connection_id, dc.name, dc.type, b.schedule_id, b.status,
			COALESCE(b.size_bytes, 0), COALESCE(b.storage_path, ''), COALESCE(b.error_message, ''),
			b.started_at, b.completed_at,
			b.restore_status, b.verified, COALESCE(b.verification_error, '')
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1
		ORDER BY b.started_at DESC NULLS LAST
		LIMIT 100
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch backups"})
		return
	}
	defer rows.Close()

	var backups []models.BackupJob
	for rows.Next() {
		var b models.BackupJob
		var scheduleID sql.NullInt64
		var sizeBytes int64
		var restoreStatus, verificationError sql.NullString
		var verified sql.NullBool
		if err := rows.Scan(&b.ID, &b.ConnectionID, &b.ConnectionName, &b.ConnectionType, &scheduleID, &b.Status, &sizeBytes, &b.StoragePath, &b.ErrorMessage, &b.StartedAt, &b.CompletedAt, &restoreStatus, &verified, &verificationError); err != nil {
			continue
		}
		if scheduleID.Valid {
			sid := int(scheduleID.Int64)
			b.ScheduleID = &sid
		}
		b.SizeBytes = &sizeBytes
		if restoreStatus.Valid {
			b.RestoreStatus = restoreStatus.String
		}
		if verified.Valid {
			v := verified.Bool
			b.Verified = &v
		}
		if verificationError.Valid {
			b.VerificationError = verificationError.String
		}
		backups = append(backups, b)
	}
	if backups == nil {
		backups = []models.BackupJob{}
	}
	c.JSON(http.StatusOK, backups)
}

func (h *BackupHandler) Trigger(c *gin.Context) {
	userID := c.GetInt("user_id")
	connID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	// Verify connection belongs to user
	var conn models.DBConnection
	err = h.DB.QueryRow(
		"SELECT id, user_id, name, type, host, port, database_name, username, password_encrypted FROM db_connections WHERE id = $1 AND user_id = $2",
		connID, userID,
	).Scan(&conn.ID, &conn.UserID, &conn.Name, &conn.Type, &conn.Host, &conn.Port, &conn.Database, &conn.Username, &conn.PasswordEncrypted)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	// SECURITY: decrypt password in memory only — never logged or returned to frontend
	if conn.PasswordEncrypted != "" {
		plain, err := crypto.Decrypt(conn.PasswordEncrypted)
		if err == nil {
			conn.PasswordEncrypted = plain
		}
	}

	go h.Runner.RunBackup(conn, nil)

	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "backup.triggered", "connection", connID, map[string]interface{}{"name": conn.Name}, c.ClientIP())
	}
	c.JSON(http.StatusAccepted, gin.H{"message": "Backup triggered"})
}

func (h *BackupHandler) Download(c *gin.Context) {
	userID := c.GetInt("user_id")
	backupID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid backup ID"})
		return
	}

	var storagePath string
	var connID int
	err = h.DB.QueryRow(`
		SELECT b.storage_path, b.connection_id FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE b.id = $1 AND dc.user_id = $2 AND b.status = 'success'
	`, backupID, userID).Scan(&storagePath, &connID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Backup not found"})
		return
	}

	store := GetStorageForBackup(h.DB, h.Cfg, connID, userID, h.Storage)
	obj, err := store.GetObject(storagePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get backup file"})
		return
	}
	defer obj.Close()

	stat, err := obj.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to stat backup file"})
		return
	}

	filename := filepath.Base(storagePath)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	c.Header("Content-Type", "application/gzip")
	c.Header("Content-Length", fmt.Sprintf("%d", stat.Size))
	io.Copy(c.Writer, obj)
}

func (h *BackupHandler) Stats(c *gin.Context) {
	userID := c.GetInt("user_id")

	var stats models.DashboardStats

	h.DB.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1
	`, userID).Scan(&stats.TotalBackups)

	h.DB.QueryRow(`
		SELECT COALESCE(SUM(b.size_bytes), 0) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.status = 'success'
	`, userID).Scan(&stats.StorageUsed)

	h.DB.QueryRow(`
		SELECT COUNT(*) FROM schedules s
		JOIN db_connections dc ON s.connection_id = dc.id
		WHERE dc.user_id = $1 AND s.enabled = true
	`, userID).Scan(&stats.ActiveSchedules)

	var lastStatus sql.NullString
	h.DB.QueryRow(`
		SELECT b.status FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1
		ORDER BY b.started_at DESC NULLS LAST LIMIT 1
	`, userID).Scan(&lastStatus)
	if lastStatus.Valid {
		stats.LastBackupStatus = lastStatus.String
	} else {
		stats.LastBackupStatus = "none"
	}

	// Additional stats for enhanced dashboard
	var verifiedCount int
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.verified = true
	`, userID).Scan(&verifiedCount)

	verificationRate := float64(0)
	if stats.TotalBackups > 0 {
		verificationRate = float64(verifiedCount) / float64(stats.TotalBackups) * 100
	}

	var unresolvedAnomalies int
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM anomalies a
		JOIN db_connections dc ON a.connection_id = dc.id
		WHERE dc.user_id = $1 AND a.resolved = false
	`, userID).Scan(&unresolvedAnomalies)

	// Week trend
	var weekBackups int
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.started_at >= NOW() - INTERVAL '7 days'
	`, userID).Scan(&weekBackups)

	c.JSON(http.StatusOK, gin.H{
		"total_backups":        stats.TotalBackups,
		"storage_used":         stats.StorageUsed,
		"active_schedules":     stats.ActiveSchedules,
		"last_backup_status":   stats.LastBackupStatus,
		"verification_rate":    verificationRate,
		"unresolved_anomalies": unresolvedAnomalies,
		"week_backups":         weekBackups,
	})
}

func (h *BackupHandler) ChartData(c *gin.Context) {
	userID := c.GetInt("user_id")

	rows, err := h.DB.Query(`
		SELECT DATE(b.started_at) as day,
			COUNT(CASE WHEN b.status = 'success' THEN 1 END) as success,
			COUNT(CASE WHEN b.status = 'failed' THEN 1 END) as failed
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1 AND b.started_at >= NOW() - INTERVAL '30 days'
		GROUP BY DATE(b.started_at)
		ORDER BY day
	`, userID)
	if err != nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	defer rows.Close()

	type ChartPoint struct {
		Day     string `json:"day"`
		Success int    `json:"success"`
		Failed  int    `json:"failed"`
	}
	var data []ChartPoint
	for rows.Next() {
		var cp ChartPoint
		rows.Scan(&cp.Day, &cp.Success, &cp.Failed)
		if len(cp.Day) > 10 {
			cp.Day = cp.Day[:10]
		}
		data = append(data, cp)
	}
	if data == nil {
		data = []ChartPoint{}
	}
	c.JSON(http.StatusOK, data)
}

func (h *BackupHandler) ActivityFeed(c *gin.Context) {
	userID := c.GetInt("user_id")

	rows, err := h.DB.Query(`
		SELECT b.id, dc.name, dc.type, b.status, COALESCE(b.size_bytes, 0), b.started_at
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.user_id = $1
		ORDER BY b.started_at DESC NULLS LAST
		LIMIT 10
	`, userID)
	if err != nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	defer rows.Close()

	type Activity struct {
		ID         int    `json:"id"`
		Name       string `json:"name"`
		Type       string `json:"type"`
		Status     string `json:"status"`
		SizeBytes  int64  `json:"size_bytes"`
		StartedAt  string `json:"started_at"`
	}
	var activities []Activity
	for rows.Next() {
		var a Activity
		var startedAt sql.NullTime
		rows.Scan(&a.ID, &a.Name, &a.Type, &a.Status, &a.SizeBytes, &startedAt)
		if startedAt.Valid {
			a.StartedAt = startedAt.Time.Format("2006-01-02T15:04:05Z")
		}
		activities = append(activities, a)
	}
	if activities == nil {
		activities = []Activity{}
	}
	c.JSON(http.StatusOK, activities)
}

func (h *BackupHandler) Restore(c *gin.Context) {
	userID := c.GetInt("user_id")
	backupID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid backup ID"})
		return
	}

	events := make(chan backup.RestoreEvent, 100)
	go h.RestoreRunner.Restore(backupID, userID, events)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	c.Stream(func(w io.Writer) bool {
		event, ok := <-events
		if !ok {
			return false
		}
		c.SSEvent(event.Type, event.Message)
		return true
	})
}
