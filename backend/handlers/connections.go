package handlers

import (
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/models"
)


type ConnectionHandler struct {
	DB          *sql.DB
	AuditLogger interface{ LogAction(int, string, string, int, map[string]interface{}, string) }
}

// connAccessClause returns a SQL WHERE fragment and args to check that a connection
// is accessible by the current user — either owned directly or via org membership.
// Caller must pass the connection ID as the first arg ($1) before appending these.
func connAccessClause(c *gin.Context, userID int) (string, []interface{}) {
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		return "(user_id = $2 OR org_id = $3)", []interface{}{userID, orgIDRaw}
	}
	return "user_id = $2", []interface{}{userID}
}

func (h *ConnectionHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	var rows *sql.Rows
	var err error
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		rows, err = h.DB.Query(
			"SELECT id, user_id, name, type, host, port, database_name, username, COALESCE(retention_days, 30), storage_provider_id, COALESCE(encryption_enabled, false), COALESCE(auth_source, 'admin'), created_at FROM db_connections WHERE org_id = $1 OR (org_id IS NULL AND user_id = $2) ORDER BY created_at DESC",
			orgIDRaw, userID,
		)
	} else {
		rows, err = h.DB.Query(
			"SELECT id, user_id, name, type, host, port, database_name, username, COALESCE(retention_days, 30), storage_provider_id, COALESCE(encryption_enabled, false), COALESCE(auth_source, 'admin'), created_at FROM db_connections WHERE user_id = $1 ORDER BY created_at DESC",
			userID,
		)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch connections"})
		return
	}
	defer rows.Close()

	var connections []models.DBConnection
	for rows.Next() {
		var conn models.DBConnection
		var spID sql.NullInt64
		if err := rows.Scan(&conn.ID, &conn.UserID, &conn.Name, &conn.Type, &conn.Host, &conn.Port, &conn.Database, &conn.Username, &conn.RetentionDays, &spID, &conn.EncryptionEnabled, &conn.AuthSource, &conn.CreatedAt); err != nil {
			continue
		}
		if spID.Valid {
			id := int(spID.Int64)
			conn.StorageProviderID = &id
		}
		connections = append(connections, conn)
	}
	if connections == nil {
		connections = []models.DBConnection{}
	}
	c.JSON(http.StatusOK, connections)
}

func (h *ConnectionHandler) Create(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req models.CreateConnectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	validTypes := map[string]bool{"postgres": true, "mysql": true, "mongodb": true, "sqlite": true}
	if !validTypes[req.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid type. Must be: postgres, mysql, mongodb, or sqlite"})
		return
	}

	// Plan enforcement: free=1 connection, pro=5, team=unlimited
	plan := getUserPlan(h.DB, userID)
	if plan == "free" || plan == "pro" {
		var count int
		h.DB.QueryRow("SELECT COUNT(*) FROM db_connections WHERE user_id = $1", userID).Scan(&count)
		limit := 1
		if plan == "pro" {
			limit = 5
		}
		if count >= limit {
			if plan == "free" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Free plan is limited to 1 connection. Upgrade to Pro for up to 5 connections.", "upgrade_required": true})
			} else {
				c.JSON(http.StatusForbidden, gin.H{"error": "Pro plan is limited to 5 connections. Upgrade to Team for unlimited connections.", "upgrade_required": true})
			}
			return
		}
	}

	retentionDays := req.RetentionDays
	if retentionDays <= 0 {
		retentionDays = 30
	}

	// Clamp retention to plan limit
	retentionLimit := getRetentionLimit(plan)
	if retentionDays > retentionLimit {
		retentionDays = retentionLimit
	}

	// SECURITY: credentials never returned to frontend — store encrypted
	encPassword, err := crypto.Encrypt(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt credentials"})
		return
	}

	var id int
	authSource := req.AuthSource
	if authSource == "" {
		authSource = "admin"
	}
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		err = h.DB.QueryRow(
			"INSERT INTO db_connections (user_id, org_id, name, type, host, port, database_name, username, password_encrypted, retention_days, storage_provider_id, auth_source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id",
			userID, orgIDRaw, req.Name, req.Type, req.Host, req.Port, req.Database, req.Username, encPassword, retentionDays, req.StorageProviderID, authSource,
		).Scan(&id)
	} else {
		err = h.DB.QueryRow(
			"INSERT INTO db_connections (user_id, name, type, host, port, database_name, username, password_encrypted, retention_days, storage_provider_id, auth_source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id",
			userID, req.Name, req.Type, req.Host, req.Port, req.Database, req.Username, encPassword, retentionDays, req.StorageProviderID, authSource,
		).Scan(&id)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create connection"})
		return
	}

	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "connection.created", "connection", id, map[string]interface{}{"name": req.Name, "type": req.Type, "host": req.Host, "database": req.Database}, c.ClientIP())
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Connection created"})
}

func (h *ConnectionHandler) Delete(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	clause, extraArgs := connAccessClause(c, userID)
	result, err := h.DB.Exec("DELETE FROM db_connections WHERE id = $1 AND "+clause, append([]interface{}{id}, extraArgs...)...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete connection"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}
	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "connection.deleted", "connection", id, map[string]interface{}{"id": id}, c.ClientIP())
	}
	c.JSON(http.StatusOK, gin.H{"message": "Connection deleted"})
}

func (h *ConnectionHandler) TestConnection(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var conn models.DBConnection
	var query string
	var args []interface{}
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		query = "SELECT id, type, host, port, database_name, username, password_encrypted FROM db_connections WHERE id = $1 AND (org_id = $2 OR user_id = $3)"
		args = []interface{}{id, orgIDRaw, userID}
	} else {
		query = "SELECT id, type, host, port, database_name, username, password_encrypted FROM db_connections WHERE id = $1 AND user_id = $2"
		args = []interface{}{id, userID}
	}
	err = h.DB.QueryRow(query, args...).Scan(&conn.ID, &conn.Type, &conn.Host, &conn.Port, &conn.Database, &conn.Username, &conn.PasswordEncrypted)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	// Decrypt password for auth-based tests (postgres)
	plainPassword := conn.PasswordEncrypted
	if conn.PasswordEncrypted != "" {
		if p, err := crypto.Decrypt(conn.PasswordEncrypted); err == nil {
			plainPassword = p
		}
	}

	var testErr error
	switch conn.Type {
	case "postgres":
		dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable connect_timeout=5",
			conn.Host, conn.Port, conn.Username, plainPassword, conn.Database)
		testDB, err := sql.Open("postgres", dsn)
		if err != nil {
			testErr = err
		} else {
			defer testDB.Close()
			testErr = testDB.Ping()
		}
	case "sqlite":
		// For SQLite, just check the file path is not empty
		if conn.Database == "" {
			testErr = fmt.Errorf("database file path is required")
		}
	default:
		// MongoDB Atlas uses SRV records — resolve actual shard hosts via SRV lookup
		if conn.Type == "mongodb" && strings.Contains(conn.Host, ".mongodb.net") {
			_, addrs, err := net.LookupSRV("mongodb", "tcp", conn.Host)
			if err != nil || len(addrs) == 0 {
				testErr = fmt.Errorf("cannot resolve MongoDB Atlas host (check hostname is correct)")
			} else {
				addr := fmt.Sprintf("%s:%d", strings.TrimSuffix(addrs[0].Target, "."), addrs[0].Port)
				connTest, err := net.DialTimeout("tcp", addr, 5*time.Second)
				if err != nil {
					testErr = fmt.Errorf("cannot reach MongoDB Atlas (check IP whitelist: 161.118.183.218): %v", err)
				} else {
					connTest.Close()
				}
			}
		} else {
			addr := fmt.Sprintf("%s:%d", conn.Host, conn.Port)
			connTest, err := net.DialTimeout("tcp", addr, 5*time.Second)
			if err != nil {
				testErr = err
			} else {
				connTest.Close()
			}
		}
	}

	if testErr != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "error": testErr.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Connection successful"})
}

func (h *ConnectionHandler) UpdateRetention(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req struct {
		RetentionDays int `json:"retention_days"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if req.RetentionDays < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "retention_days must be >= 0 (0 = forever)"})
		return
	}

	// Clamp retention to plan limit
	retentionLimit := getRetentionLimit(getUserPlan(h.DB, userID))
	days := req.RetentionDays
	if days > retentionLimit {
		days = retentionLimit
	}

	clause, extraArgs := connAccessClause(c, userID)
	result, err := h.DB.Exec("UPDATE db_connections SET retention_days = $1 WHERE id = $2 AND "+clause, append([]interface{}{days, id}, extraArgs...)...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update retention"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Retention updated"})
}

func (h *ConnectionHandler) UpdateStorageProvider(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req struct {
		StorageProviderID *int `json:"storage_provider_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	clause, extraArgs := connAccessClause(c, userID)
	result, err := h.DB.Exec("UPDATE db_connections SET storage_provider_id = $1 WHERE id = $2 AND "+clause, append([]interface{}{req.StorageProviderID, id}, extraArgs...)...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Storage provider updated"})
}

// GetEncryption returns the encryption status for a connection. Never returns the key.
func (h *ConnectionHandler) GetEncryption(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	clause, extraArgs := connAccessClause(c, userID)
	var enabled bool
	err = h.DB.QueryRow(
		"SELECT COALESCE(encryption_enabled, false) FROM db_connections WHERE id = $1 AND "+clause,
		append([]interface{}{id}, extraArgs...)...,
	).Scan(&enabled)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"enabled": enabled})
}

// SetEncryption enables or disables backup encryption for a connection.
// The raw password is never stored — only a PBKDF2-derived key encrypted with the master key.
func (h *ConnectionHandler) SetEncryption(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req struct {
		Enabled  bool   `json:"enabled"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Verify connection is accessible
	encClause, encArgs := connAccessClause(c, userID)
	var exists bool
	h.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM db_connections WHERE id = $1 AND "+encClause+")", append([]interface{}{id}, encArgs...)...).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	if !req.Enabled {
		// Disable: clear key, set flag to false
		_, err = h.DB.Exec(
			"UPDATE db_connections SET encryption_enabled = false, encryption_key_encrypted = NULL WHERE id = $1 AND "+encClause,
			append([]interface{}{id}, encArgs...)...,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to disable encryption"})
			return
		}
		if h.AuditLogger != nil {
			h.AuditLogger.LogAction(userID, "encryption.disabled", "connection", id, map[string]interface{}{"id": id}, c.ClientIP())
		}
		c.JSON(http.StatusOK, gin.H{"message": "Encryption disabled"})
		return
	}

	// Enable: require password
	if req.Password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password is required to enable encryption"})
		return
	}
	if len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 8 characters"})
		return
	}

	// Derive 32-byte key from password using connection ID as salt
	salt := fmt.Sprintf("snapbase-backup-%d-%d", userID, id)
	derivedKey := crypto.DeriveKey(req.Password, salt)

	// Encrypt the derived key using the master ENCRYPTION_KEY
	encKey, err := crypto.Encrypt(string(derivedKey))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt key"})
		return
	}

	_, err = h.DB.Exec(
		"UPDATE db_connections SET encryption_enabled = true, encryption_key_encrypted = $1 WHERE id = $2 AND "+encClause,
		append([]interface{}{encKey, id}, encArgs...)...,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enable encryption"})
		return
	}
	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "encryption.enabled", "connection", id, map[string]interface{}{"id": id}, c.ClientIP())
	}
	c.JSON(http.StatusOK, gin.H{"message": "Encryption enabled"})
}

func (h *ConnectionHandler) Health(c *gin.Context) {
	userID := c.GetInt("user_id")

	rows, err := h.DB.Query(`
		SELECT dc.id, dc.name, dc.type,
			COALESCE((
				SELECT b.status FROM backup_jobs b
				WHERE b.connection_id = dc.id
				ORDER BY b.started_at DESC NULLS LAST LIMIT 1
			), 'none') as last_status,
			EXISTS(
				SELECT 1 FROM anomalies a
				WHERE a.connection_id = dc.id AND a.resolved = false
			) as has_anomaly
		FROM db_connections dc
		WHERE dc.user_id = $1
	`, userID)
	if err != nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	defer rows.Close()

	type ConnHealth struct {
		ID         int    `json:"id"`
		Name       string `json:"name"`
		Type       string `json:"type"`
		LastStatus string `json:"last_status"`
		HasAnomaly bool   `json:"has_anomaly"`
	}
	var health []ConnHealth
	for rows.Next() {
		var ch ConnHealth
		rows.Scan(&ch.ID, &ch.Name, &ch.Type, &ch.LastStatus, &ch.HasAnomaly)
		health = append(health, ch)
	}
	if health == nil {
		health = []ConnHealth{}
	}
	c.JSON(http.StatusOK, health)
}

// getRetentionLimit returns the max retention days allowed for a given plan.
func getRetentionLimit(plan string) int {
	switch plan {
	case "pro":
		return 30
	case "team", "enterprise":
		return 90
	default: // free
		return 7
	}
}
