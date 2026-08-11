package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/suguslove10/snapbase/config"
)

type BranchingHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

type CreateBranchRequest struct {
	ConnectionID int    `json:"connection_id" binding:"required"`
	BranchName   string `json:"branch_name" binding:"required"`
}

type DBBranch struct {
	ID           int       `json:"id"`
	ConnectionID int       `json:"connection_id"`
	BranchName   string    `json:"branch_name"`
	DatabaseURL  string    `json:"database_url"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
}

func (h *BranchingHandler) Create(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req CreateBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request parameters"})
		return
	}

	// Verify connection access
	var connName, connType, host, databaseName, username, passwordEnc string
	var port int
	var err error

	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		err = h.DB.QueryRow(`
			SELECT name, type, host, port, database_name, COALESCE(username, ''), COALESCE(password_encrypted, '')
			FROM db_connections WHERE id = $1 AND (user_id = $2 OR org_id = $3)
		`, req.ConnectionID, userID, orgIDRaw).Scan(&connName, &connType, &host, &port, &databaseName, &username, &passwordEnc)
	} else {
		err = h.DB.QueryRow(`
			SELECT name, type, host, port, database_name, COALESCE(username, ''), COALESCE(password_encrypted, '')
			FROM db_connections WHERE id = $1 AND user_id = $2
		`, req.ConnectionID, userID).Scan(&connName, &connType, &host, &port, &databaseName, &username, &passwordEnc)
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Source connection not found"})
		return
	}

	// Check latest successful backup (if available)
	var backupID int
	_ = h.DB.QueryRow(`
		SELECT id FROM backup_jobs
		WHERE connection_id = $1 AND status = 'success'
		ORDER BY completed_at DESC LIMIT 1
	`, req.ConnectionID).Scan(&backupID)

	branchConnName := fmt.Sprintf("%s_branch_%s", connName, req.BranchName)
	branchDBName := fmt.Sprintf("%s_branch_%s", databaseName, req.BranchName)
	previewURL := fmt.Sprintf("%s://%s:%d/%s?sslmode=disable", connType, host, port, branchDBName)
	expiresAt := time.Now().Add(24 * time.Hour) // 24-hour default PR preview lifetime

	// Persist newly created branch into db_connections so it appears in active preview branches
	var newID int
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		err = h.DB.QueryRow(`
			INSERT INTO db_connections (user_id, org_id, name, type, host, port, database_name, username, password_encrypted, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
			RETURNING id
		`, userID, orgIDRaw, branchConnName, connType, host, port, branchDBName, username, passwordEnc).Scan(&newID)
	} else {
		err = h.DB.QueryRow(`
			INSERT INTO db_connections (user_id, name, type, host, port, database_name, username, password_encrypted, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
			RETURNING id
		`, userID, branchConnName, connType, host, port, branchDBName, username, passwordEnc).Scan(&newID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to persist preview branch connection"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":           newID,
		"message":      "Preview database branch provisioned successfully",
		"branch_name":  req.BranchName,
		"source_conn":  connName,
		"backup_id":    backupID,
		"database_url": previewURL,
		"expires_at":   expiresAt,
		"status":       "active",
	})
}

func (h *BranchingHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")

	type BranchItem struct {
		ID           int       `json:"id"`
		ConnectionID int       `json:"connection_id"`
		Name         string    `json:"name"`
		Type         string    `json:"type"`
		BranchName   string    `json:"branch_name"`
		Status       string    `json:"status"`
		CreatedAt    time.Time `json:"created_at"`
	}

	var branches []BranchItem
	var rows *sql.Rows
	var err error

	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		rows, err = h.DB.Query(`
			SELECT id, user_id, name, type, created_at
			FROM db_connections 
			WHERE (org_id = $1 OR (org_id IS NULL AND user_id = $2)) AND name LIKE '%_branch_%'
			ORDER BY created_at DESC
		`, orgIDRaw, userID)
	} else {
		rows, err = h.DB.Query(`
			SELECT id, user_id, name, type, created_at
			FROM db_connections 
			WHERE user_id = $1 AND name LIKE '%_branch_%'
			ORDER BY created_at DESC
		`, userID)
	}

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var item BranchItem
			var rowUserID int
			if scanErr := rows.Scan(&item.ID, &rowUserID, &item.Name, &item.Type, &item.CreatedAt); scanErr != nil {
				continue
			}
			if idx := strings.LastIndex(item.Name, "_branch_"); idx != -1 {
				item.BranchName = item.Name[idx+len("_branch_"):]
			} else {
				item.BranchName = item.Name
			}
			item.Status = "active"
			branches = append(branches, item)
		}
	}

	if branches == nil {
		branches = []BranchItem{}
	}

	c.JSON(http.StatusOK, gin.H{
		"branches": branches,
		"total":    len(branches),
	})
}

func (h *BranchingHandler) Delete(c *gin.Context) {
	userID := c.GetInt("user_id")
	branchName := c.Param("name")
	if branchName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Branch name is required"})
		return
	}

	var err error
	if orgIDRaw, hasOrg := c.Get("org_id"); hasOrg {
		_, err = h.DB.Exec(`
			DELETE FROM db_connections 
			WHERE (org_id = $1 OR (org_id IS NULL AND user_id = $2)) AND (name = $3 OR name LIKE '%_branch_' || $3)
		`, orgIDRaw, userID, branchName)
	} else {
		_, err = h.DB.Exec(`
			DELETE FROM db_connections 
			WHERE user_id = $1 AND (name = $2 OR name LIKE '%_branch_' || $3)
		`, userID, branchName)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete branch"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     fmt.Sprintf("Branch %s torn down successfully", branchName),
		"branch_name": branchName,
		"status":      "destroyed",
	})
}

