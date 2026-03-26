package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/robfig/cron/v3"

	"github.com/suguslove10/snapbase/models"
	"github.com/suguslove10/snapbase/scheduler"
)

// isAtMostDaily returns true if the cron expression runs at most once per day.
// Free plan users may only use daily (or less frequent) schedules.
func isAtMostDaily(expr string) bool {
	parts := strings.Fields(expr)
	if len(parts) != 5 {
		return false
	}
	hour := parts[1]
	// If hour is a wildcard or step (e.g. *, */6) the schedule runs multiple times per day
	if hour == "*" || strings.HasPrefix(hour, "*/") {
		return false
	}
	return true
}

type ScheduleHandler struct {
	DB          *sql.DB
	Scheduler   *scheduler.Scheduler
	AuditLogger interface{ LogAction(int, string, string, int, map[string]interface{}, string) }
}

func (h *ScheduleHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	rows, err := h.DB.Query(`
		SELECT s.id, s.connection_id, dc.name, s.cron_expression, s.enabled, s.last_run, s.next_run, s.created_at
		FROM schedules s
		JOIN db_connections dc ON s.connection_id = dc.id
		WHERE dc.user_id = $1
		ORDER BY s.created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch schedules"})
		return
	}
	defer rows.Close()

	var schedules []models.Schedule
	for rows.Next() {
		var s models.Schedule
		if err := rows.Scan(&s.ID, &s.ConnectionID, &s.ConnectionName, &s.CronExpression, &s.Enabled, &s.LastRun, &s.NextRun, &s.CreatedAt); err != nil {
			continue
		}
		schedules = append(schedules, s)
	}
	if schedules == nil {
		schedules = []models.Schedule{}
	}
	c.JSON(http.StatusOK, schedules)
}

func (h *ScheduleHandler) Create(c *gin.Context) {
	userID := c.GetInt("user_id")
	var req models.CreateScheduleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Validate cron expression
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	_, err := parser.Parse(req.CronExpression)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cron expression: " + err.Error()})
		return
	}

	// Plan enforcement: free plan is limited to daily (or less frequent) schedules
	if getUserPlan(h.DB, userID) == "free" && !isAtMostDaily(req.CronExpression) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Free plan supports daily backups only. Upgrade to Pro for more frequent schedules.", "upgrade_required": true})
		return
	}

	// Verify connection belongs to user
	var connID int
	err = h.DB.QueryRow("SELECT id FROM db_connections WHERE id = $1 AND user_id = $2", req.ConnectionID, userID).Scan(&connID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Connection not found"})
		return
	}

	var id int
	err = h.DB.QueryRow(
		"INSERT INTO schedules (connection_id, cron_expression, enabled) VALUES ($1, $2, true) RETURNING id",
		req.ConnectionID, req.CronExpression,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create schedule"})
		return
	}

	// Register with scheduler
	h.Scheduler.AddSchedule(id, req.ConnectionID, req.CronExpression)

	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "schedule.created", "schedule", id, map[string]interface{}{"connection_id": req.ConnectionID, "cron": req.CronExpression}, c.ClientIP())
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Schedule created"})
}

func (h *ScheduleHandler) Delete(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	result, err := h.DB.Exec(`
		DELETE FROM schedules WHERE id = $1 AND connection_id IN (
			SELECT id FROM db_connections WHERE user_id = $2
		)
	`, id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete schedule"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Schedule not found"})
		return
	}

	h.Scheduler.RemoveSchedule(id)

	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "schedule.deleted", "schedule", id, map[string]interface{}{"id": id}, c.ClientIP())
	}
	c.JSON(http.StatusOK, gin.H{"message": "Schedule deleted"})
}

func (h *ScheduleHandler) Update(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if req.Enabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "enabled field is required"})
		return
	}

	// Get schedule details and verify ownership
	var connID int
	var cronExpr string
	err = h.DB.QueryRow(`
		SELECT s.connection_id, s.cron_expression FROM schedules s
		JOIN db_connections dc ON s.connection_id = dc.id
		WHERE s.id = $1 AND dc.user_id = $2
	`, id, userID).Scan(&connID, &cronExpr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Schedule not found"})
		return
	}

	_, err = h.DB.Exec("UPDATE schedules SET enabled = $1 WHERE id = $2", *req.Enabled, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update schedule"})
		return
	}

	if *req.Enabled {
		h.Scheduler.AddSchedule(id, connID, cronExpr)
	} else {
		h.Scheduler.RemoveSchedule(id)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Schedule updated"})
}
