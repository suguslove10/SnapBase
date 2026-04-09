package insights

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/models"
)

type Handler struct {
	DB  *sql.DB
	Cfg *config.Config
}

type storedInsight struct {
	ID             int            `json:"id"`
	ConnectionID   int            `json:"connection_id"`
	ConnectionName string         `json:"connection_name"`
	ConnectionType string         `json:"connection_type"`
	SchemaSnapshot string         `json:"schema_snapshot"`
	Insights       *InsightResult `json:"insights"`
	Model          string         `json:"model"`
	GeneratedAt    time.Time      `json:"generated_at"`
}

// Get returns the most recent insight for a connection.
func (h *Handler) Get(c *gin.Context) {
	userID := c.GetInt("user_id")
	connID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	conn, err := h.loadConn(connID, userID, c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	var si storedInsight
	var insightsJSON []byte
	err = h.DB.QueryRow(`
		SELECT id, connection_id, schema_snapshot, insights, model, generated_at
		FROM schema_insights WHERE connection_id = $1 ORDER BY generated_at DESC LIMIT 1
	`, connID).Scan(&si.ID, &si.ConnectionID, &si.SchemaSnapshot, &insightsJSON, &si.Model, &si.GeneratedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusOK, gin.H{"exists": false})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch insight"})
		return
	}

	if err := json.Unmarshal(insightsJSON, &si.Insights); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse stored insights"})
		return
	}
	si.ConnectionName = conn.Name
	si.ConnectionType = conn.Type

	c.JSON(http.StatusOK, gin.H{"exists": true, "insight": si})
}

// Generate extracts the schema, calls Claude, stores and returns the result.
func getUserPlan(db *sql.DB, userID int) string {
	var plan, status string
	err := db.QueryRow(
		"SELECT plan, status FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
		userID,
	).Scan(&plan, &status)
	if err != nil {
		return "free"
	}
	if status == "active" || status == "trialing" {
		return plan
	}
	return "free"
}

func (h *Handler) Generate(c *gin.Context) {
	userID := c.GetInt("user_id")
	if plan := getUserPlan(h.DB, userID); plan == "free" {
		c.JSON(http.StatusForbidden, gin.H{"error": "AI Schema Insights are available on Pro and Team plans. Upgrade to unlock.", "upgrade_required": true})
		return
	}
	connID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	conn, err := h.loadConn(connID, userID, c)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	// Extract schema
	schema, err := ExtractSchema(*conn)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to extract schema: " + err.Error()})
		return
	}

	// Call OpenAI
	result, err := AnalyzeSchema(h.Cfg.OpenAIAPIKey, schema)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI analysis failed: " + err.Error()})
		return
	}

	insightsJSON, err := json.Marshal(result)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to serialize insights"})
		return
	}

	var siID int
	err = h.DB.QueryRow(`
		INSERT INTO schema_insights (connection_id, schema_snapshot, insights, model)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, connID, schema, insightsJSON, aiModel).Scan(&siID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store insights"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"exists": true,
		"insight": storedInsight{
			ID:             siID,
			ConnectionID:   connID,
			ConnectionName: conn.Name,
			ConnectionType: conn.Type,
			SchemaSnapshot: schema,
			Insights:       result,
			Model:          aiModel,
			GeneratedAt:    time.Now(),
		},
	})
}

// List returns the latest insight for every connection the user can access.
func (h *Handler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	var rows *sql.Rows
	var err error

	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		rows, err = h.DB.Query(`
			SELECT DISTINCT ON (dc.id) dc.id, dc.name, dc.type,
				si.id, si.insights, si.model, si.generated_at
			FROM db_connections dc
			LEFT JOIN schema_insights si ON si.connection_id = dc.id
			WHERE dc.org_id = $1 OR (dc.org_id IS NULL AND dc.user_id = $2)
			ORDER BY dc.id, si.generated_at DESC NULLS LAST
		`, orgIDRaw, userID)
	} else {
		rows, err = h.DB.Query(`
			SELECT DISTINCT ON (dc.id) dc.id, dc.name, dc.type,
				si.id, si.insights, si.model, si.generated_at
			FROM db_connections dc
			LEFT JOIN schema_insights si ON si.connection_id = dc.id
			WHERE dc.user_id = $1
			ORDER BY dc.id, si.generated_at DESC NULLS LAST
		`, userID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch insights"})
		return
	}
	defer rows.Close()

	type listItem struct {
		ConnectionID   int            `json:"connection_id"`
		ConnectionName string         `json:"connection_name"`
		ConnectionType string         `json:"connection_type"`
		InsightID      *int           `json:"insight_id"`
		Insights       *InsightResult `json:"insights"`
		Model          string         `json:"model"`
		GeneratedAt    *time.Time     `json:"generated_at"`
	}

	var items []listItem
	for rows.Next() {
		var item listItem
		var siID sql.NullInt64
		var insightsJSON []byte
		var model sql.NullString
		var genAt sql.NullTime
		if err := rows.Scan(&item.ConnectionID, &item.ConnectionName, &item.ConnectionType,
			&siID, &insightsJSON, &model, &genAt); err != nil {
			continue
		}
		if siID.Valid {
			id := int(siID.Int64)
			item.InsightID = &id
			item.Model = model.String
			t := genAt.Time
			item.GeneratedAt = &t
			if len(insightsJSON) > 0 {
				json.Unmarshal(insightsJSON, &item.Insights)
			}
		}
		items = append(items, item)
	}
	if items == nil {
		items = []listItem{}
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) loadConn(connID, userID int, c *gin.Context) (*models.DBConnection, error) {
	var conn models.DBConnection
	var spID sql.NullInt64
	var err error
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		err = h.DB.QueryRow(`
			SELECT id, user_id, name, type, host, port, database_name, username,
			       password_encrypted, COALESCE(retention_days,30), storage_provider_id,
			       COALESCE(encryption_enabled,false), COALESCE(auth_source,'admin'), created_at
			FROM db_connections WHERE id = $1 AND (user_id = $2 OR org_id = $3)
		`, connID, userID, orgIDRaw).Scan(
			&conn.ID, &conn.UserID, &conn.Name, &conn.Type, &conn.Host, &conn.Port,
			&conn.Database, &conn.Username, &conn.PasswordEncrypted,
			&conn.RetentionDays, &spID, &conn.EncryptionEnabled, &conn.AuthSource, &conn.CreatedAt,
		)
	} else {
		err = h.DB.QueryRow(`
			SELECT id, user_id, name, type, host, port, database_name, username,
			       password_encrypted, COALESCE(retention_days,30), storage_provider_id,
			       COALESCE(encryption_enabled,false), COALESCE(auth_source,'admin'), created_at
			FROM db_connections WHERE id = $1 AND user_id = $2
		`, connID, userID).Scan(
			&conn.ID, &conn.UserID, &conn.Name, &conn.Type, &conn.Host, &conn.Port,
			&conn.Database, &conn.Username, &conn.PasswordEncrypted,
			&conn.RetentionDays, &spID, &conn.EncryptionEnabled, &conn.AuthSource, &conn.CreatedAt,
		)
	}
	if err != nil {
		return nil, err
	}
	// Decrypt password for schema extraction
	if conn.PasswordEncrypted != "" {
		if pw, err := crypto.Decrypt(conn.PasswordEncrypted); err == nil {
			conn.PasswordEncrypted = pw
		}
	}
	return &conn, nil
}
