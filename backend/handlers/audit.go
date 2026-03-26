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
	ID          int    `json:"id"`
	UserID      int    `json:"user_id"`
	UserEmail   string `json:"user_email"`
	Action      string `json:"action"`
	Resource    string `json:"resource"`
	ResourceID  int    `json:"resource_id"`
	Metadata    string `json:"metadata"`
	IPAddress   string `json:"ip_address"`
	CreatedAt   string `json:"created_at"`
}

func (h *AuditHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit := 50
	offset := (page - 1) * limit

	actionFilter := c.Query("action")

	// For org owners/admins, show all member activity in their org
	orgIDRaw, hasOrg := c.Get("org_id")

	baseSelect := `
		SELECT al.id, al.user_id, COALESCE(u.email, 'unknown') as user_email,
			al.action, COALESCE(al.resource, ''), COALESCE(al.resource_id, 0),
			COALESCE(al.metadata::text, '{}'), COALESCE(al.ip_address, ''),
			al.created_at
		FROM audit_logs al
		LEFT JOIN users u ON u.id = al.user_id`

	var rows *sql.Rows
	var err error

	if hasOrg {
		// Show all activity from org members
		if actionFilter != "" {
			rows, err = h.DB.Query(baseSelect+`
				WHERE al.user_id IN (
					SELECT user_id FROM org_members WHERE org_id = $1
				) AND al.action LIKE $2
				ORDER BY al.created_at DESC LIMIT $3 OFFSET $4
			`, orgIDRaw, actionFilter+"%", limit, offset)
		} else {
			rows, err = h.DB.Query(baseSelect+`
				WHERE al.user_id IN (
					SELECT user_id FROM org_members WHERE org_id = $1
				)
				ORDER BY al.created_at DESC LIMIT $2 OFFSET $3
			`, orgIDRaw, limit, offset)
		}
	} else {
		if actionFilter != "" {
			rows, err = h.DB.Query(baseSelect+`
				WHERE al.user_id = $1 AND al.action LIKE $2
				ORDER BY al.created_at DESC LIMIT $3 OFFSET $4
			`, userID, actionFilter+"%", limit, offset)
		} else {
			rows, err = h.DB.Query(baseSelect+`
				WHERE al.user_id = $1
				ORDER BY al.created_at DESC LIMIT $2 OFFSET $3
			`, userID, limit, offset)
		}
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch audit logs"})
		return
	}
	defer rows.Close()

	var logs []AuditLogEntry
	for rows.Next() {
		var l AuditLogEntry
		var createdAt sql.NullString
		if err := rows.Scan(&l.ID, &l.UserID, &l.UserEmail, &l.Action, &l.Resource, &l.ResourceID, &l.Metadata, &l.IPAddress, &createdAt); err != nil {
			continue
		}
		if createdAt.Valid {
			l.CreatedAt = createdAt.String
		}
		logs = append(logs, l)
	}
	if logs == nil {
		logs = []AuditLogEntry{}
	}

	var total int
	if hasOrg {
		h.DB.QueryRow(`SELECT COUNT(*) FROM audit_logs WHERE user_id IN (SELECT user_id FROM org_members WHERE org_id = $1)`, orgIDRaw).Scan(&total)
	} else {
		h.DB.QueryRow("SELECT COUNT(*) FROM audit_logs WHERE user_id = $1", userID).Scan(&total)
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":  logs,
		"total": total,
		"page":  page,
	})
}
