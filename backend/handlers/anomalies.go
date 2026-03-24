package handlers

import (
	"database/sql"
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

	rows, err := h.DB.Query(`
		SELECT a.id, a.connection_id, dc.name, a.backup_job_id, a.type, a.message, a.severity, a.resolved, a.created_at
		FROM anomalies a
		JOIN db_connections dc ON a.connection_id = dc.id
		WHERE dc.user_id = $1
		ORDER BY a.created_at DESC
		LIMIT 100
	`, userID)
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

	result, err := h.DB.Exec(`
		UPDATE anomalies SET resolved = true
		WHERE id = $1 AND connection_id IN (
			SELECT id FROM db_connections WHERE user_id = $2
		)
	`, id, userID)
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
	h.DB.QueryRow(`
		SELECT COUNT(*) FROM anomalies a
		JOIN db_connections dc ON a.connection_id = dc.id
		WHERE dc.user_id = $1 AND a.resolved = false
	`, userID).Scan(&unresolved)

	c.JSON(http.StatusOK, gin.H{"unresolved": unresolved})
}
