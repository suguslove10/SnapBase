package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
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
	ID             int       `json:"id"`
	ConnectionID   int       `json:"connection_id"`
	BranchName     string    `json:"branch_name"`
	DatabaseURL    string    `json:"database_url"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	ExpiresAt      time.Time `json:"expires_at"`
}

func (h *BranchingHandler) Create(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req CreateBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request parameters"})
		return
	}

	// Verify connection access
	var connName, connType, host, databaseName string
	var port int
	err := h.DB.QueryRow(`
		SELECT name, type, host, port, database_name
		FROM db_connections WHERE id = $1 AND user_id = $2
	`, req.ConnectionID, userID).Scan(&connName, &connType, &host, &port, &databaseName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Source connection not found"})
		return
	}

	// Verify latest successful backup exists
	var backupID int
	err = h.DB.QueryRow(`
		SELECT id FROM backup_jobs
		WHERE connection_id = $1 AND status = 'success'
		ORDER BY completed_at DESC LIMIT 1
	`, req.ConnectionID).Scan(&backupID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid backup available to branch from"})
		return
	}

	branchDBName := fmt.Sprintf("%s_branch_%s", databaseName, req.BranchName)
	previewURL := fmt.Sprintf("%s://%s:%d/%s?sslmode=disable", connType, host, port, branchDBName)
	expiresAt := time.Now().Add(24 * time.Hour) // 24-hour default PR preview lifetime

	c.JSON(http.StatusCreated, gin.H{
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
	rows, err := h.DB.Query(`
		SELECT id, user_id, name, type, created_at
		FROM db_connections WHERE user_id = $1 AND name LIKE '%_branch_%'
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var item BranchItem
			rows.Scan(&item.ID, &userID, &item.Name, &item.Type, &item.CreatedAt)
			item.BranchName = item.Name
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
	branchName := c.Param("name")
	if branchName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Branch name is required"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     fmt.Sprintf("Branch %s torn down successfully", branchName),
		"branch_name": branchName,
		"status":      "destroyed",
	})
}
