package retention

import (
	"database/sql"
	"log"

	"github.com/suguslove10/snapbase/storage"
)

type Cleaner struct {
	DB      *sql.DB
	Storage storage.StorageClient
}

func (c *Cleaner) RunRetentionCleanup() {
	log.Println("Running retention cleanup...")

	rows, err := c.DB.Query(`
		SELECT b.id, b.storage_path, dc.name, dc.retention_days
		FROM backup_jobs b
		JOIN db_connections dc ON b.connection_id = dc.id
		WHERE dc.retention_days > 0
		  AND b.status = 'success'
		  AND b.completed_at < NOW() - (dc.retention_days || ' days')::interval
	`)
	if err != nil {
		log.Printf("Retention cleanup query failed: %v", err)
		return
	}
	defer rows.Close()

	var cleaned int
	for rows.Next() {
		var id int
		var storagePath, connName string
		var retentionDays int
		if err := rows.Scan(&id, &storagePath, &connName, &retentionDays); err != nil {
			continue
		}

		// Delete from MinIO
		if storagePath != "" {
			if err := c.Storage.Delete(storagePath); err != nil {
				log.Printf("Failed to delete backup %d from storage: %v", id, err)
				continue
			}
		}

		// Delete from DB
		if _, err := c.DB.Exec("DELETE FROM backup_jobs WHERE id = $1", id); err != nil {
			log.Printf("Failed to delete backup %d from DB: %v", id, err)
			continue
		}

		cleaned++
	}

	if cleaned > 0 {
		log.Printf("Retention cleanup: deleted %d expired backups", cleaned)
	} else {
		log.Println("Retention cleanup: no expired backups found")
	}
}
