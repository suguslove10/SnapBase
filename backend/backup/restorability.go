package backup

import (
	"database/sql"
	"log"

	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/storage"
)

// RunRestorabilityChecks samples recent successful backups that haven't been
// test-restored and runs them through the existing Verifier, which performs a
// full restore-and-count against a temporary database. Results are mirrored to
// the test_restore_* columns so the UI can surface a "verified restorable" badge.
//
// One verification per connection per week (idempotent on test_restored_at), and
// at most 5 per cycle so we don't hammer customer databases.
func RunRestorabilityChecks(db *sql.DB, store storage.StorageClient, cfg *config.Config) {
	rows, err := db.Query(`
		SELECT b.id
		FROM backup_jobs b
		WHERE b.status = 'success'
		  AND b.started_at > NOW() - INTERVAL '7 days'
		  AND (b.test_restored_at IS NULL OR b.test_restored_at < NOW() - INTERVAL '7 days')
		  AND b.connection_id NOT IN (
			SELECT connection_id FROM backup_jobs
			WHERE test_restored_at > NOW() - INTERVAL '7 days'
		  )
		ORDER BY b.started_at DESC
		LIMIT 5
	`)
	if err != nil {
		log.Printf("[restorability] query failed: %v", err)
		return
	}
	defer rows.Close()

	ids := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}

	if len(ids) == 0 {
		return
	}

	v := &Verifier{DB: db, Storage: store, Cfg: cfg}
	for _, id := range ids {
		v.VerifyBackup(id)

		// Mirror the verifier's verdict into the test_restore_* columns.
		var verified sql.NullBool
		var verErr sql.NullString
		db.QueryRow(`SELECT verified, verification_error FROM backup_jobs WHERE id = $1`, id).Scan(&verified, &verErr)

		status := "failed"
		errMsg := ""
		if verified.Valid && verified.Bool {
			status = "verified"
		} else if verErr.Valid {
			errMsg = verErr.String
		}
		db.Exec(`
			UPDATE backup_jobs
			SET test_restored_at = NOW(), test_restore_status = $1, test_restore_error = $2
			WHERE id = $3
		`, status, errMsg, id)
	}
	log.Printf("[restorability] checked %d backup(s)", len(ids))
}
