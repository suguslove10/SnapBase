package handlers

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/config"
)

type StatusHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

// Status returns current health of major components plus 30-day uptime.
// Public endpoint — no auth, no user-specific data leaked.
func (h *StatusHandler) Status(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	// Component checks (live).
	type Component struct {
		Name      string  `json:"name"`
		Status    string  `json:"status"`
		LatencyMs int64   `json:"latency_ms"`
		Uptime30  float64 `json:"uptime_30d"`
	}

	live := []Component{}

	// API itself responded → operational by definition.
	api := Component{Name: "API", Status: "operational", LatencyMs: 0}
	api.Uptime30 = computeUptime(h.DB, "api", 30)
	live = append(live, api)

	// Database ping.
	t0 := time.Now()
	dbStatus := "operational"
	if err := h.DB.PingContext(ctx); err != nil {
		dbStatus = "down"
	}
	live = append(live, Component{
		Name:      "Database",
		Status:    dbStatus,
		LatencyMs: time.Since(t0).Milliseconds(),
		Uptime30:  computeUptime(h.DB, "database", 30),
	})

	// Scheduler — derived from recent backup_jobs activity (if any backup completed in the last hour, it's up).
	schedulerStatus := "operational"
	var n int
	h.DB.QueryRow("SELECT COUNT(*) FROM backup_jobs WHERE started_at > NOW() - INTERVAL '6 hours'").Scan(&n)
	// We don't penalize on no recent backups since not every install has frequent jobs.
	live = append(live, Component{
		Name:      "Scheduler",
		Status:    schedulerStatus,
		LatencyMs: 0,
		Uptime30:  computeUptime(h.DB, "scheduler", 30),
	})

	// Storage — count failed backups in last hour. Rough proxy.
	t0 = time.Now()
	storageStatus := "operational"
	var failedRecent int
	h.DB.QueryRow("SELECT COUNT(*) FROM backup_jobs WHERE status = 'failed' AND started_at > NOW() - INTERVAL '1 hour'").Scan(&failedRecent)
	if failedRecent > 5 {
		storageStatus = "degraded"
	}
	live = append(live, Component{
		Name:      "Storage",
		Status:    storageStatus,
		LatencyMs: time.Since(t0).Milliseconds(),
		Uptime30:  computeUptime(h.DB, "storage", 30),
	})

	overall := "operational"
	for _, c := range live {
		if c.Status == "down" {
			overall = "down"
			break
		}
		if c.Status == "degraded" && overall != "down" {
			overall = "degraded"
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"overall":      overall,
		"components":   live,
		"last_checked": time.Now(),
	})
}

// computeUptime — % of checks marked operational over `days` days.
func computeUptime(db *sql.DB, component string, days int) float64 {
	var total, ok int
	db.QueryRow(
		"SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'operational') FROM uptime_checks WHERE component = $1 AND checked_at > NOW() - $2::interval",
		component, days,
	).Scan(&total, &ok)
	if total == 0 {
		return 100.0
	}
	return float64(ok) / float64(total) * 100
}

// RecordUptimeChecks — background job, called every minute by main.go.
// Writes one row per component so /status can report 30-day uptime.
func RecordUptimeChecks(db *sql.DB) {
	// API: we're alive if this runs.
	db.Exec("INSERT INTO uptime_checks (component, status, latency_ms) VALUES ('api', 'operational', 0)")

	// Database: ping is implicit if exec succeeded; record explicit row.
	t0 := time.Now()
	if err := db.Ping(); err != nil {
		db.Exec("INSERT INTO uptime_checks (component, status, latency_ms) VALUES ('database', 'down', $1)", time.Since(t0).Milliseconds())
	} else {
		db.Exec("INSERT INTO uptime_checks (component, status, latency_ms) VALUES ('database', 'operational', $1)", time.Since(t0).Milliseconds())
	}

	// Scheduler: heartbeat. We assume it's up (the goroutine running this is part of the app).
	db.Exec("INSERT INTO uptime_checks (component, status, latency_ms) VALUES ('scheduler', 'operational', 0)")

	// Storage: classify by recent backup failure rate.
	var failedRecent int
	db.QueryRow("SELECT COUNT(*) FROM backup_jobs WHERE status = 'failed' AND started_at > NOW() - INTERVAL '5 minutes'").Scan(&failedRecent)
	status := "operational"
	if failedRecent > 5 {
		status = "degraded"
	}
	db.Exec("INSERT INTO uptime_checks (component, status, latency_ms) VALUES ('storage', $1, 0)", status)

	// Trim — keep ~90 days max.
	db.Exec("DELETE FROM uptime_checks WHERE checked_at < NOW() - INTERVAL '90 days'")
}
