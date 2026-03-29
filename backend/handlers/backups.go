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
	const listQ = `
		SELECT b.id, b.connection_id, dc.name, dc.type,
			COALESCE(dc.host, ''), COALESCE(dc.port, 0), dc.database_name, COALESCE(dc.username, ''),
			b.schedule_id, b.status,
			COALESCE(b.size_bytes, 0), COALESCE(b.storage_path, ''), COALESCE(b.error_message, ''),
			b.started_at, b.completed_at,
			b.restore_status, b.verified, COALESCE(b.verification_error, ''),
			COALESCE(b.encrypted, false)
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE %s
		ORDER BY b.started_at DESC NULLS LAST
		LIMIT 100`
	var rows *sql.Rows
	var err error
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		rows, err = h.DB.Query(fmt.Sprintf(listQ, "(dc.org_id = $1 OR (dc.org_id IS NULL AND dc.user_id = $2))"), orgIDRaw, userID)
	} else {
		rows, err = h.DB.Query(fmt.Sprintf(listQ, "dc.user_id = $1"), userID)
	}
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
		if err := rows.Scan(&b.ID, &b.ConnectionID, &b.ConnectionName, &b.ConnectionType, &b.ConnectionHost, &b.ConnectionPort, &b.ConnectionDatabase, &b.ConnectionUsername, &scheduleID, &b.Status, &sizeBytes, &b.StoragePath, &b.ErrorMessage, &b.StartedAt, &b.CompletedAt, &restoreStatus, &verified, &verificationError, &b.Encrypted); err != nil {
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

	// Verify connection is accessible (own or org-shared)
	var conn models.DBConnection
	var triggerQuery string
	var triggerArgs []interface{}
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		triggerQuery = "SELECT id, user_id, name, type, host, port, database_name, username, password_encrypted, COALESCE(auth_source, 'admin') FROM db_connections WHERE id = $1 AND (user_id = $2 OR org_id = $3)"
		triggerArgs = []interface{}{connID, userID, orgIDRaw}
	} else {
		triggerQuery = "SELECT id, user_id, name, type, host, port, database_name, username, password_encrypted, COALESCE(auth_source, 'admin') FROM db_connections WHERE id = $1 AND user_id = $2"
		triggerArgs = []interface{}{connID, userID}
	}
	err = h.DB.QueryRow(triggerQuery, triggerArgs...).Scan(&conn.ID, &conn.UserID, &conn.Name, &conn.Type, &conn.Host, &conn.Port, &conn.Database, &conn.Username, &conn.PasswordEncrypted, &conn.AuthSource)
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

	// Storage limit enforcement
	plan := getUserPlan(h.DB, userID)
	used := GetStorageUsed(h.DB, userID)
	limit := GetStorageLimit(plan)
	if used >= limit {
		var limitGB int64 = limit / (1024 * 1024 * 1024)
		var msg string
		switch plan {
		case "free":
			msg = fmt.Sprintf("Free plan storage limit (%dGB) reached. Upgrade to Pro for 10GB.", limitGB)
		case "pro":
			msg = fmt.Sprintf("Pro plan storage limit (%dGB) reached. Upgrade to Team for 100GB.", limitGB)
		default:
			msg = fmt.Sprintf("Storage limit (%dGB) reached. Please contact support.", limitGB)
		}
		c.JSON(http.StatusForbidden, gin.H{"error": msg, "upgrade_required": true})
		return
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
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		err = h.DB.QueryRow(`
			SELECT b.storage_path, b.connection_id FROM backup_jobs b
			JOIN db_connections dc ON b.connection_id = dc.id
			WHERE b.id = $1 AND (dc.org_id = $2 OR (dc.org_id IS NULL AND dc.user_id = $3)) AND b.status = 'success'
		`, backupID, orgIDRaw, userID).Scan(&storagePath, &connID)
	} else {
		err = h.DB.QueryRow(`
			SELECT b.storage_path, b.connection_id FROM backup_jobs b
			JOIN db_connections dc ON b.connection_id = dc.id
			WHERE b.id = $1 AND dc.user_id = $2 AND b.status = 'success'
		`, backupID, userID).Scan(&storagePath, &connID)
	}
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

	// Build org-aware condition once, reuse for every sub-query
	var orgCond string
	var orgArgs []interface{}
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		orgCond = "(dc.org_id = $1 OR (dc.org_id IS NULL AND dc.user_id = $2))"
		orgArgs = []interface{}{orgIDRaw, userID}
	} else {
		orgCond = "dc.user_id = $1"
		orgArgs = []interface{}{userID}
	}

	var stats models.DashboardStats

	h.DB.QueryRow(fmt.Sprintf(`
		SELECT COUNT(*) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE %s`, orgCond), orgArgs...).Scan(&stats.TotalBackups)

	h.DB.QueryRow(fmt.Sprintf(`
		SELECT COALESCE(SUM(b.size_bytes), 0) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE %s AND b.status = 'success'`, orgCond), orgArgs...).Scan(&stats.StorageUsed)

	h.DB.QueryRow(fmt.Sprintf(`
		SELECT COUNT(*) FROM schedules s
		JOIN db_connections dc ON s.connection_id = dc.id
		WHERE %s AND s.enabled = true`, orgCond), orgArgs...).Scan(&stats.ActiveSchedules)

	var lastStatus sql.NullString
	h.DB.QueryRow(fmt.Sprintf(`
		SELECT b.status FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE %s
		ORDER BY b.started_at DESC NULLS LAST LIMIT 1`, orgCond), orgArgs...).Scan(&lastStatus)
	if lastStatus.Valid {
		stats.LastBackupStatus = lastStatus.String
	} else {
		stats.LastBackupStatus = "none"
	}

	var verifiedCount int
	h.DB.QueryRow(fmt.Sprintf(`
		SELECT COUNT(*) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE %s AND b.verified = true`, orgCond), orgArgs...).Scan(&verifiedCount)

	verificationRate := float64(0)
	if stats.TotalBackups > 0 {
		verificationRate = float64(verifiedCount) / float64(stats.TotalBackups) * 100
	}

	var unresolvedAnomalies int
	h.DB.QueryRow(fmt.Sprintf(`
		SELECT COUNT(*) FROM anomalies a
		JOIN db_connections dc ON a.connection_id = dc.id
		WHERE %s AND a.resolved = false`, orgCond), orgArgs...).Scan(&unresolvedAnomalies)

	var weekBackups int
	h.DB.QueryRow(fmt.Sprintf(`
		SELECT COUNT(*) FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE %s AND b.started_at >= NOW() - INTERVAL '7 days'`, orgCond), orgArgs...).Scan(&weekBackups)

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
	const chartQ = `
		SELECT DATE(b.started_at) as day,
			COUNT(CASE WHEN b.status = 'success' THEN 1 END) as success,
			COUNT(CASE WHEN b.status = 'failed' THEN 1 END) as failed
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE %s AND b.started_at >= NOW() - INTERVAL '30 days'
		GROUP BY DATE(b.started_at)
		ORDER BY day`
	var rows *sql.Rows
	var err error
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		rows, err = h.DB.Query(fmt.Sprintf(chartQ, "(dc.org_id = $1 OR (dc.org_id IS NULL AND dc.user_id = $2))"), orgIDRaw, userID)
	} else {
		rows, err = h.DB.Query(fmt.Sprintf(chartQ, "dc.user_id = $1"), userID)
	}
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
	const actQ = `
		SELECT b.id, dc.name, dc.type, b.status, COALESCE(b.size_bytes, 0), b.started_at
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE %s
		ORDER BY b.started_at DESC NULLS LAST
		LIMIT 10`
	var rows *sql.Rows
	var err error
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		rows, err = h.DB.Query(fmt.Sprintf(actQ, "(dc.org_id = $1 OR (dc.org_id IS NULL AND dc.user_id = $2))"), orgIDRaw, userID)
	} else {
		rows, err = h.DB.Query(fmt.Sprintf(actQ, "dc.user_id = $1"), userID)
	}
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

	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "backup.restored", "backup", backupID, map[string]interface{}{"backup_id": backupID}, c.ClientIP())
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
