package models

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

	"github.com/suguslove10/snapbase/config"
)

func InitDB(cfg *config.Config) *sql.DB {
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	createTables(db)
	markStaleRunningJobs(db)
	seedAdmin(db)

	return db
}

// markStaleRunningJobs marks any jobs left in "running" state as "failed".
// This happens when the server crashes or is redeployed mid-backup.
func markStaleRunningJobs(db *sql.DB) {
	res, err := db.Exec(`
		UPDATE backup_jobs
		SET status = 'failed', error_message = 'Server restarted while backup was in progress'
		WHERE status = 'running'
	`)
	if err != nil {
		log.Printf("Warning: failed to mark stale running jobs: %v", err)
		return
	}
	n, _ := res.RowsAffected()
	if n > 0 {
		log.Printf("Marked %d stale running backup job(s) as failed", n)
	}
}

func createTables(db *sql.DB) {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			email VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS db_connections (
			id SERIAL PRIMARY KEY,
			user_id INTEGER REFERENCES users(id),
			name VARCHAR(255) NOT NULL,
			type VARCHAR(50) NOT NULL,
			host VARCHAR(255),
			port INTEGER,
			database_name VARCHAR(255) NOT NULL,
			username VARCHAR(255),
			password_encrypted VARCHAR(255),
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS backup_jobs (
			id SERIAL PRIMARY KEY,
			connection_id INTEGER REFERENCES db_connections(id) ON DELETE CASCADE,
			schedule_id INTEGER,
			status VARCHAR(50) DEFAULT 'pending',
			size_bytes BIGINT,
			storage_path VARCHAR(500),
			error_message TEXT,
			started_at TIMESTAMP,
			completed_at TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS schedules (
			id SERIAL PRIMARY KEY,
			connection_id INTEGER REFERENCES db_connections(id) ON DELETE CASCADE,
			cron_expression VARCHAR(100) NOT NULL,
			enabled BOOLEAN DEFAULT true,
			last_run TIMESTAMP,
			next_run TIMESTAMP,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Fatalf("Failed to create table: %v", err)
		}
	}

	// Migrations
	migrations := []string{
		`ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS retention_days INTEGER DEFAULT 30`,
		`ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS restore_status VARCHAR(50)`,
		`ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS restored_at TIMESTAMP`,
		`ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS verified BOOLEAN`,
		`CREATE TABLE IF NOT EXISTS audit_logs (
			id SERIAL PRIMARY KEY,
			user_id INTEGER REFERENCES users(id),
			action VARCHAR(100) NOT NULL,
			resource VARCHAR(100),
			resource_id INTEGER,
			metadata JSONB DEFAULT '{}',
			ip_address VARCHAR(50),
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS anomalies (
			id SERIAL PRIMARY KEY,
			connection_id INTEGER REFERENCES db_connections(id) ON DELETE CASCADE,
			backup_job_id INTEGER REFERENCES backup_jobs(id) ON DELETE SET NULL,
			type VARCHAR(100) NOT NULL,
			message TEXT NOT NULL,
			severity VARCHAR(20) NOT NULL DEFAULT 'warning',
			resolved BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`,
		`ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS verification_details TEXT`,
		`ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS verification_error TEXT`,
		`CREATE TABLE IF NOT EXISTS storage_providers (
			id SERIAL PRIMARY KEY,
			user_id INTEGER REFERENCES users(id),
			name VARCHAR(255) NOT NULL,
			provider_type VARCHAR(50) NOT NULL,
			endpoint VARCHAR(500),
			access_key VARCHAR(255),
			secret_key_encrypted VARCHAR(500),
			bucket VARCHAR(255) NOT NULL,
			region VARCHAR(100),
			use_ssl BOOLEAN DEFAULT true,
			is_default BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS storage_provider_id INTEGER`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'local'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255)`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)`,
		`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
		`CREATE TABLE IF NOT EXISTS subscriptions (
			id SERIAL PRIMARY KEY,
			user_id INTEGER REFERENCES users(id) UNIQUE,
			stripe_customer_id VARCHAR(255),
			stripe_subscription_id VARCHAR(255),
			plan VARCHAR(20) DEFAULT 'free',
			status VARCHAR(20) DEFAULT 'active',
			trial_ends_at TIMESTAMP,
			current_period_end TIMESTAMP,
			cancel_at_period_end BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS settings (
			id SERIAL PRIMARY KEY,
			user_id INTEGER REFERENCES users(id),
			key VARCHAR(100) NOT NULL,
			value TEXT NOT NULL DEFAULT '',
			updated_at TIMESTAMP DEFAULT NOW(),
			UNIQUE(user_id, key)
		)`,
		`CREATE TABLE IF NOT EXISTS organizations (
			id SERIAL PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			slug VARCHAR(255) UNIQUE NOT NULL,
			owner_id INTEGER REFERENCES users(id),
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS org_members (
			id SERIAL PRIMARY KEY,
			org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
			user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
			role VARCHAR(20) NOT NULL DEFAULT 'viewer',
			created_at TIMESTAMP DEFAULT NOW(),
			UNIQUE(org_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS org_invitations (
			id SERIAL PRIMARY KEY,
			org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
			email VARCHAR(255) NOT NULL,
			role VARCHAR(20) NOT NULL DEFAULT 'viewer',
			token VARCHAR(255) UNIQUE NOT NULL,
			invited_by INTEGER REFERENCES users(id),
			accepted_at TIMESTAMP,
			expires_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
		`ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id)`,
		`ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS encryption_enabled BOOLEAN DEFAULT false`,
		`ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS encryption_key_encrypted VARCHAR(500)`,
		`ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT false`,
		`ALTER TABLE db_connections ADD COLUMN IF NOT EXISTS auth_source VARCHAR(50) DEFAULT 'admin'`,
		`DO $$
		BEGIN
			INSERT INTO organizations (name, slug, owner_id)
			SELECT u.email || '''s Workspace', u.email || '-org-' || u.id::text, u.id
			FROM users u
			WHERE NOT EXISTS (SELECT 1 FROM org_members m WHERE m.user_id = u.id);

			INSERT INTO org_members (org_id, user_id, role)
			SELECT o.id, o.owner_id, 'owner'
			FROM organizations o
			ON CONFLICT (org_id, user_id) DO NOTHING;

			UPDATE db_connections dc
			SET org_id = (
				SELECT m.org_id FROM org_members m
				WHERE m.user_id = dc.user_id AND m.role = 'owner'
				LIMIT 1
			)
			WHERE dc.org_id IS NULL;
		END $$`,
		`CREATE TABLE IF NOT EXISTS password_reset_tokens (
			id SERIAL PRIMARY KEY,
			user_id INTEGER REFERENCES users(id),
			token VARCHAR(255) UNIQUE NOT NULL,
			expires_at TIMESTAMP NOT NULL,
			used_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT NOW()
		)`,
	}
	for _, m := range migrations {
		db.Exec(m)
	}
}

func seedAdmin(db *sql.DB) {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE email = $1", "admin@snapbase.local").Scan(&count)
	if err != nil {
		log.Printf("Error checking admin user: %v", err)
		return
	}
	if count > 0 {
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Error hashing password: %v", err)
		return
	}

	_, err = db.Exec("INSERT INTO users (email, password_hash) VALUES ($1, $2)", "admin@snapbase.local", string(hash))
	if err != nil {
		log.Printf("Error creating admin user: %v", err)
		return
	}
	log.Println("Created default admin user: admin@snapbase.local / admin123")
}

func SeedDefaultStorageProvider(db *sql.DB, endpoint, accessKey, secretKeyEnc, bucket string, useSSL bool) {
	// Get admin user ID
	var userID int
	err := db.QueryRow("SELECT id FROM users WHERE email = $1", "admin@snapbase.local").Scan(&userID)
	if err != nil {
		return
	}

	var spCount int
	db.QueryRow("SELECT COUNT(*) FROM storage_providers WHERE user_id = $1 AND is_default = true", userID).Scan(&spCount)
	if spCount > 0 {
		return
	}

	_, err = db.Exec(`
		INSERT INTO storage_providers (user_id, name, provider_type, endpoint, access_key, secret_key_encrypted, bucket, use_ssl, is_default)
		VALUES ($1, 'Local MinIO (Default)', 'minio', $2, $3, $4, $5, $6, true)
	`, userID, endpoint, accessKey, secretKeyEnc, bucket, useSSL)
	if err != nil {
		log.Printf("Error seeding default storage provider: %v", err)
		return
	}
	log.Println("Created default storage provider: Local MinIO (Default)")
}
