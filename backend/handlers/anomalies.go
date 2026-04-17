package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type AnomalyHandler struct {
	DB *sql.DB
}

type AnomalyResponse struct {
	ID             int     `json:"id"`
	ConnectionID   int     `json:"connection_id"`
	ConnectionName string  `json:"connection_name"`
	BackupJobID    *int    `json:"backup_job_id"`
	Type           string  `json:"type"`
	Message        string  `json:"message"`
	Severity       string  `json:"severity"`
	Resolved       bool    `json:"resolved"`
	CreatedAt      string  `json:"created_at"`
}

func (h *AnomalyHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	const anomQ = `
		SELECT a.id, a.connection_id, dc.name, a.backup_job_id, a.type, a.message, a.severity, a.resolved, a.created_at
		FROM anomalies a
		JOIN db_connections dc ON a.connection_id = dc.id
		WHERE %s
		ORDER BY a.created_at DESC
		LIMIT 100`
	var rows *sql.Rows
	var err error
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		rows, err = h.DB.Query(fmt.Sprintf(anomQ, "(dc.org_id = $1 OR (dc.org_id IS NULL AND dc.user_id = $2))"), orgIDRaw, userID)
	} else {
		rows, err = h.DB.Query(fmt.Sprintf(anomQ, "dc.user_id = $1"), userID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch anomalies"})
		return
	}
	defer rows.Close()

	var anomalies []AnomalyResponse
	for rows.Next() {
		var a AnomalyResponse
		var bjID sql.NullInt64
		if err := rows.Scan(&a.ID, &a.ConnectionID, &a.ConnectionName, &bjID, &a.Type, &a.Message, &a.Severity, &a.Resolved, &a.CreatedAt); err != nil {
			continue
		}
		if bjID.Valid {
			id := int(bjID.Int64)
			a.BackupJobID = &id
		}
		anomalies = append(anomalies, a)
	}
	if anomalies == nil {
		anomalies = []AnomalyResponse{}
	}
	c.JSON(http.StatusOK, anomalies)
}

func (h *AnomalyHandler) Resolve(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var result sql.Result
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		result, err = h.DB.Exec(`
			UPDATE anomalies SET resolved = true
			WHERE id = $1 AND connection_id IN (
				SELECT id FROM db_connections WHERE org_id = $2 OR (org_id IS NULL AND user_id = $3)
			)
		`, id, orgIDRaw, userID)
	} else {
		result, err = h.DB.Exec(`
			UPDATE anomalies SET resolved = true
			WHERE id = $1 AND connection_id IN (
				SELECT id FROM db_connections WHERE user_id = $2
			)
		`, id, userID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve anomaly"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Anomaly not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Anomaly resolved"})
}

func (h *AnomalyHandler) Stats(c *gin.Context) {
	userID := c.GetInt("user_id")

	var unresolved int
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		h.DB.QueryRow(`
			SELECT COUNT(*) FROM anomalies a
			JOIN db_connections dc ON a.connection_id = dc.id
			WHERE (dc.org_id = $1 OR (dc.org_id IS NULL AND dc.user_id = $2)) AND a.resolved = false
		`, orgIDRaw, userID).Scan(&unresolved)
	} else {
		h.DB.QueryRow(`
			SELECT COUNT(*) FROM anomalies a
			JOIN db_connections dc ON a.connection_id = dc.id
			WHERE dc.user_id = $1 AND a.resolved = false
		`, userID).Scan(&unresolved)
	}

	c.JSON(http.StatusOK, gin.H{"unresolved": unresolved})
}

// GetAnomalySettings returns the anomaly threshold settings for a connection.
func (h *AnomalyHandler) GetAnomalySettings(c *gin.Context) {
	connID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}
	var dropThreshold, spikeThreshold float64
	err = h.DB.QueryRow(
		"SELECT size_drop_threshold, size_spike_threshold FROM anomaly_settings WHERE connection_id = $1", connID,
	).Scan(&dropThreshold, &spikeThreshold)
	if err != nil {
		// Return defaults
		dropThreshold, spikeThreshold = 0.5, 3.0
	}
	c.JSON(http.StatusOK, gin.H{
		"connection_id":        connID,
		"size_drop_threshold":  dropThreshold,
		"size_spike_threshold": spikeThreshold,
	})
}

// UpdateAnomalySettings upserts anomaly threshold settings for a connection.
func (h *AnomalyHandler) UpdateAnomalySettings(c *gin.Context) {
	userID := c.GetInt("user_id")
	connID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid connection ID"})
		return
	}

	// Verify ownership
	var count int
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		h.DB.QueryRow("SELECT COUNT(*) FROM db_connections WHERE id = $1 AND (org_id = $2 OR (org_id IS NULL AND user_id = $3))", connID, orgIDRaw, userID).Scan(&count)
	} else {
		h.DB.QueryRow("SELECT COUNT(*) FROM db_connections WHERE id = $1 AND user_id = $2", connID, userID).Scan(&count)
	}
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	var req struct {
		SizeDropThreshold  float64 `json:"size_drop_threshold"`
		SizeSpikeThreshold float64 `json:"size_spike_threshold"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	// Clamp values to reasonable range
	if req.SizeDropThreshold < 0.1 { req.SizeDropThreshold = 0.1 }
	if req.SizeDropThreshold > 0.9 { req.SizeDropThreshold = 0.9 }
	if req.SizeSpikeThreshold < 1.5 { req.SizeSpikeThreshold = 1.5 }
	if req.SizeSpikeThreshold > 10.0 { req.SizeSpikeThreshold = 10.0 }

	_, err = h.DB.Exec(`
		INSERT INTO anomaly_settings (connection_id, size_drop_threshold, size_spike_threshold, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (connection_id) DO UPDATE
		SET size_drop_threshold = $2, size_spike_threshold = $3, updated_at = NOW()
	`, connID, req.SizeDropThreshold, req.SizeSpikeThreshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save settings"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Anomaly settings updated"})
}
