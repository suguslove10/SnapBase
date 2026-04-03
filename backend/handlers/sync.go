package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/robfig/cron/v3"

	"github.com/suguslove10/snapbase/models"
	"github.com/suguslove10/snapbase/scheduler"
	syncpkg "github.com/suguslove10/snapbase/sync"
)

type SyncHandler struct {
	DB         *sql.DB
	SyncRunner *syncpkg.Runner
	Scheduler  *scheduler.Scheduler
	entryMap   map[int]cron.EntryID
}

func NewSyncHandler(db *sql.DB, runner *syncpkg.Runner, sched *scheduler.Scheduler) *SyncHandler {
	return &SyncHandler{
		DB:        db,
		SyncRunner: runner,
		Scheduler: sched,
		entryMap:  make(map[int]cron.EntryID),
	}
}

func (h *SyncHandler) List(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	orgID := orgIDRaw.(int)

	rows, err := h.DB.Query(`
		SELECT sj.id, sj.org_id, sj.name, sj.source_connection_id, sj.target_connection_id,
		       sc.name, tc.name, sc.type, tc.type,
		       COALESCE(sj.schedule,''), sj.status, sj.last_run_at,
		       COALESCE(sj.last_run_status,''), COALESCE(sj.last_run_error,''),
		       sj.enabled, sj.created_at
		FROM sync_jobs sj
		JOIN db_connections sc ON sc.id = sj.source_connection_id
		JOIN db_connections tc ON tc.id = sj.target_connection_id
		WHERE sj.org_id = $1
		ORDER BY sj.created_at DESC
	`, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch sync jobs"})
		return
	}
	defer rows.Close()

	var jobs []models.SyncJob
	for rows.Next() {
		var j models.SyncJob
		if err := rows.Scan(
			&j.ID, &j.OrgID, &j.Name, &j.SourceConnectionID, &j.TargetConnectionID,
			&j.SourceConnectionName, &j.TargetConnectionName, &j.SourceType, &j.TargetType,
			&j.Schedule, &j.Status, &j.LastRunAt, &j.LastRunStatus, &j.LastRunError,
			&j.Enabled, &j.CreatedAt,
		); err != nil {
			continue
		}
		jobs = append(jobs, j)
	}
	if jobs == nil {
		jobs = []models.SyncJob{}
	}
	c.JSON(http.StatusOK, jobs)
}

func (h *SyncHandler) Create(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgID := orgIDRaw.(int)

	var req struct {
		Name               string `json:"name" binding:"required"`
		SourceConnectionID int    `json:"source_connection_id" binding:"required"`
		TargetConnectionID int    `json:"target_connection_id" binding:"required"`
		Schedule           string `json:"schedule"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, source_connection_id, and target_connection_id are required"})
		return
	}
	if req.SourceConnectionID == req.TargetConnectionID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Source and target connections must be different"})
		return
	}

	// Verify both connections belong to this org
	for _, cid := range []int{req.SourceConnectionID, req.TargetConnectionID} {
		var count int
		h.DB.QueryRow("SELECT COUNT(*) FROM db_connections WHERE id = $1 AND org_id = $2", cid, orgID).Scan(&count)
		if count == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "One or more connections not found in this organization"})
			return
		}
	}

	// Verify same DB type
	var srcType, tgtType string
	h.DB.QueryRow("SELECT type FROM db_connections WHERE id = $1", req.SourceConnectionID).Scan(&srcType)
	h.DB.QueryRow("SELECT type FROM db_connections WHERE id = $1", req.TargetConnectionID).Scan(&tgtType)
	if srcType != tgtType {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Source and target must be the same database type"})
		return
	}

	var id int
	err := h.DB.QueryRow(
		`INSERT INTO sync_jobs (org_id, name, source_connection_id, target_connection_id, schedule)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		orgID, req.Name, req.SourceConnectionID, req.TargetConnectionID, req.Schedule,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create sync job"})
		return
	}

	// Register with cron if schedule provided
	if req.Schedule != "" && h.Scheduler != nil {
		sid := id
		entryID, err := h.Scheduler.AddCustomJob(req.Schedule, func() { h.SyncRunner.RunSync(sid) })
		if err == nil {
			h.entryMap[id] = entryID
		}
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Sync job created"})
}

func (h *SyncHandler) Update(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgID := orgIDRaw.(int)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var req struct {
		Name     *string `json:"name"`
		Schedule *string `json:"schedule"`
		Enabled  *bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	result, err := h.DB.Exec(
		`UPDATE sync_jobs SET
			name     = COALESCE($1, name),
			schedule = COALESCE($2, schedule),
			enabled  = COALESCE($3, enabled)
		 WHERE id = $4 AND org_id = $5`,
		req.Name, req.Schedule, req.Enabled, id, orgID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update sync job"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sync job not found"})
		return
	}

	// Re-register cron if schedule/enabled changed
	if h.Scheduler != nil {
		if entryID, exists := h.entryMap[id]; exists {
			h.Scheduler.RemoveEntry(entryID)
			delete(h.entryMap, id)
		}
		var schedule string
		var enabled bool
		h.DB.QueryRow("SELECT COALESCE(schedule,''), enabled FROM sync_jobs WHERE id = $1", id).Scan(&schedule, &enabled)
		if schedule != "" && enabled {
			sid := id
			entryID, err := h.Scheduler.AddCustomJob(schedule, func() { h.SyncRunner.RunSync(sid) })
			if err == nil {
				h.entryMap[id] = entryID
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sync job updated"})
}

func (h *SyncHandler) Delete(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgID := orgIDRaw.(int)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	result, err := h.DB.Exec(`DELETE FROM sync_jobs WHERE id = $1 AND org_id = $2`, id, orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete sync job"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sync job not found"})
		return
	}

	if h.Scheduler != nil {
		if entryID, exists := h.entryMap[id]; exists {
			h.Scheduler.RemoveEntry(entryID)
			delete(h.entryMap, id)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sync job deleted"})
}

func (h *SyncHandler) TriggerRun(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No organization found"})
		return
	}
	orgID := orgIDRaw.(int)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var count int
	h.DB.QueryRow("SELECT COUNT(*) FROM sync_jobs WHERE id = $1 AND org_id = $2", id, orgID).Scan(&count)
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sync job not found"})
		return
	}

	go h.SyncRunner.RunSync(id)

	c.JSON(http.StatusAccepted, gin.H{"message": "Sync started"})
}

func (h *SyncHandler) Runs(c *gin.Context) {
	orgIDRaw, ok := c.Get("org_id")
	if !ok {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	orgID := orgIDRaw.(int)

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	// Verify ownership
	var count int
	h.DB.QueryRow("SELECT COUNT(*) FROM sync_jobs WHERE id = $1 AND org_id = $2", id, orgID).Scan(&count)
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sync job not found"})
		return
	}

	rows, err := h.DB.Query(`
		SELECT id, sync_job_id, status, started_at, completed_at,
		       COALESCE(error_message,''), backup_job_id
		FROM sync_runs WHERE sync_job_id = $1
		ORDER BY started_at DESC LIMIT 50
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch runs"})
		return
	}
	defer rows.Close()

	type RunRow struct {
		ID          int        `json:"id"`
		SyncJobID   int        `json:"sync_job_id"`
		Status      string     `json:"status"`
		StartedAt   *time.Time `json:"started_at"`
		CompletedAt *time.Time `json:"completed_at"`
		ErrorMessage string    `json:"error_message,omitempty"`
		BackupJobID  *int      `json:"backup_job_id"`
	}

	var list []RunRow
	for rows.Next() {
		var run RunRow
		var bjid sql.NullInt64
		if err := rows.Scan(&run.ID, &run.SyncJobID, &run.Status, &run.StartedAt, &run.CompletedAt, &run.ErrorMessage, &bjid); err != nil {
			continue
		}
		if bjid.Valid {
			v := int(bjid.Int64)
			run.BackupJobID = &v
		}
		list = append(list, run)
	}
	if list == nil {
		list = []RunRow{}
	}
	c.JSON(http.StatusOK, list)
}

// LoadSchedules registers all enabled sync jobs with schedules into the cron scheduler.
// Called at startup.
func (h *SyncHandler) LoadSchedules() {
	if h.Scheduler == nil {
		return
	}
	rows, err := h.DB.Query(`SELECT id, schedule FROM sync_jobs WHERE schedule != '' AND enabled = true`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		var expr string
		if err := rows.Scan(&id, &expr); err != nil {
			continue
		}
		sid := id
		entryID, err := h.Scheduler.AddCustomJob(expr, func() { h.SyncRunner.RunSync(sid) })
		if err == nil {
			h.entryMap[id] = entryID
		}
	}
}
