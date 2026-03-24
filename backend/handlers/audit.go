package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type AuditHandler struct {
	DB *sql.DB
}

type AuditLogEntry struct {
	ID         int    `json:"id"`
	UserID     int    `json:"user_id"`
	Action     string `json:"action"`
	Resource   string `json:"resource"`
	ResourceID int    `json:"resource_id"`
	Metadata   string `json:"metadata"`
	IPAddress  string `json:"ip_address"`
	CreatedAt  string `json:"created_at"`
}

func (h *AuditHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit := 50
	offset := (page - 1) * limit

	actionFilter := c.Query("action")

	var rows *sql.Rows
	var err error

	if actionFilter != "" {
		rows, err = h.DB.Query(`
			SELECT id, user_id, action, COALESCE(resource, ''), COALESCE(resource_id, 0),
				COALESCE(metadata::text, '{}'), COALESCE(ip_address, ''), created_at
			FROM audit_logs WHERE user_id = $1 AND action LIKE $2
			ORDER BY created_at DESC LIMIT $3 OFFSET $4
		`, userID, actionFilter+"%", limit, offset)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, user_id, action, COALESCE(resource, ''), COALESCE(resource_id, 0),
				COALESCE(metadata::text, '{}'), COALESCE(ip_address, ''), created_at
			FROM audit_logs WHERE user_id = $1
			ORDER BY created_at DESC LIMIT $2 OFFSET $3
		`, userID, limit, offset)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch audit logs"})
		return
	}
	defer rows.Close()

	var logs []AuditLogEntry
	for rows.Next() {
		var l AuditLogEntry
		if err := rows.Scan(&l.ID, &l.UserID, &l.Action, &l.Resource, &l.ResourceID, &l.Metadata, &l.IPAddress, &l.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, l)
	}
	if logs == nil {
		logs = []AuditLogEntry{}
	}

	var total int
	h.DB.QueryRow("SELECT COUNT(*) FROM audit_logs WHERE user_id = $1", userID).Scan(&total)

	c.JSON(http.StatusOK, gin.H{
		"logs":  logs,
		"total": total,
		"page":  page,
	})
}
