package audit

import (
	"database/sql"
	"encoding/json"
	"log"
)

type Logger struct {
	DB *sql.DB
}

func (l *Logger) LogAction(userID int, action, resource string, resourceID int, metadata map[string]interface{}, ipAddress string) {
	metaJSON, err := json.Marshal(metadata)
	if err != nil {
		metaJSON = []byte("{}")
	}

	_, err = l.DB.Exec(`
		INSERT INTO audit_logs (user_id, action, resource, resource_id, metadata, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, action, resource, resourceID, string(metaJSON), ipAddress)
	if err != nil {
		log.Printf("Failed to write audit log: %v", err)
	}
}
