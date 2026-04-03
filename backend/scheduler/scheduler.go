package scheduler

import (
	"database/sql"
	"log"

	"github.com/robfig/cron/v3"

	"github.com/suguslove10/snapbase/backup"
	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/models"
	"github.com/suguslove10/snapbase/retention"
)

type Scheduler struct {
	cron     *cron.Cron
	db       *sql.DB
	runner   *backup.Runner
	entryMap map[int]cron.EntryID // schedule ID -> cron entry ID
}

func New(db *sql.DB, runner *backup.Runner) *Scheduler {
	return &Scheduler{
		cron:     cron.New(),
		db:       db,
		runner:   runner,
		entryMap: make(map[int]cron.EntryID),
	}
}

func (s *Scheduler) Start() {
	// Load existing schedules from DB
	rows, err := s.db.Query(`
		SELECT s.id, s.connection_id, s.cron_expression
		FROM schedules s WHERE s.enabled = true
	`)
	if err != nil {
		log.Printf("Failed to load schedules: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, connID int
		var cronExpr string
		if err := rows.Scan(&id, &connID, &cronExpr); err != nil {
			continue
		}
		s.AddSchedule(id, connID, cronExpr)
	}

	s.cron.Start()
	log.Println("Scheduler started")
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
}

func (s *Scheduler) AddRetentionJob(cleaner *retention.Cleaner) {
	_, err := s.cron.AddFunc("0 3 * * *", func() {
		cleaner.RunRetentionCleanup()
	})
	if err != nil {
		log.Printf("Failed to add retention cleanup job: %v", err)
		return
	}
	log.Println("Registered retention cleanup job: daily at 3am")
}

func (s *Scheduler) AddSchedule(scheduleID, connectionID int, cronExpr string) {
	sid := scheduleID
	entryID, err := s.cron.AddFunc(cronExpr, func() {
		s.runScheduledBackup(sid, connectionID)
	})
	if err != nil {
		log.Printf("Failed to add schedule %d: %v", scheduleID, err)
		return
	}
	s.entryMap[scheduleID] = entryID
	s.updateNextRun(scheduleID, entryID)
	log.Printf("Registered schedule %d with cron: %s", scheduleID, cronExpr)
}

func (s *Scheduler) updateNextRun(scheduleID int, entryID cron.EntryID) {
	next := s.cron.Entry(entryID).Next
	if next.IsZero() {
		return
	}
	if _, err := s.db.Exec("UPDATE schedules SET next_run = $1 WHERE id = $2", next, scheduleID); err != nil {
		log.Printf("Failed to update next_run for schedule %d: %v", scheduleID, err)
	}
}

// AddCustomJob registers an arbitrary function on a cron expression.
// Returns the entry ID so the caller can remove it later.
func (s *Scheduler) AddCustomJob(cronExpr string, fn func()) (cron.EntryID, error) {
	return s.cron.AddFunc(cronExpr, fn)
}

// RemoveEntry removes a cron entry by ID.
func (s *Scheduler) RemoveEntry(id cron.EntryID) {
	s.cron.Remove(id)
}

func (s *Scheduler) RemoveSchedule(scheduleID int) {
	if entryID, ok := s.entryMap[scheduleID]; ok {
		s.cron.Remove(entryID)
		delete(s.entryMap, scheduleID)
		log.Printf("Removed schedule %d", scheduleID)
	}
}

func (s *Scheduler) runScheduledBackup(scheduleID, connectionID int) {
	var conn models.DBConnection
	err := s.db.QueryRow(
		"SELECT id, user_id, name, type, host, port, database_name, username, password_encrypted FROM db_connections WHERE id = $1",
		connectionID,
	).Scan(&conn.ID, &conn.UserID, &conn.Name, &conn.Type, &conn.Host, &conn.Port, &conn.Database, &conn.Username, &conn.PasswordEncrypted)
	if err != nil {
		log.Printf("Failed to load connection %d for schedule %d: %v", connectionID, scheduleID, err)
		return
	}

	// SECURITY: decrypt password in memory only — never logged or returned to frontend
	if conn.PasswordEncrypted != "" {
		if plain, err := crypto.Decrypt(conn.PasswordEncrypted); err == nil {
			conn.PasswordEncrypted = plain
		}
	}

	s.runner.RunBackup(conn, &scheduleID)

	// Refresh next_run now that this run has completed
	if entryID, ok := s.entryMap[scheduleID]; ok {
		s.updateNextRun(scheduleID, entryID)
	}
}
