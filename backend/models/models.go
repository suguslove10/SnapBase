package models

import "time"

type User struct {
	ID           int       `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Provider     string    `json:"provider"`
	ProviderID   string    `json:"-"`
	AvatarURL    string    `json:"avatar_url,omitempty"`
	Name         string    `json:"name,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type DBConnection struct {
	ID                int       `json:"id"`
	UserID            int       `json:"user_id"`
	Name              string    `json:"name"`
	Type              string    `json:"type"` // postgres, mysql, mongodb, sqlite
	Host              string    `json:"host"`
	Port              int       `json:"port"`
	Database          string    `json:"database"`
	Username          string    `json:"username"`
	PasswordEncrypted string    `json:"-"`
	Password          string    `json:"password,omitempty"` // only for input
	RetentionDays     int       `json:"retention_days"`
	StorageProviderID *int      `json:"storage_provider_id"`
	CreatedAt         time.Time `json:"created_at"`
}

type BackupJob struct {
	ID                  int        `json:"id"`
	ConnectionID        int        `json:"connection_id"`
	ConnectionName      string     `json:"connection_name,omitempty"`
	ConnectionType      string     `json:"connection_type,omitempty"`
	ScheduleID          *int       `json:"schedule_id"`
	Status              string     `json:"status"` // pending, running, success, failed
	SizeBytes           *int64     `json:"size_bytes"`
	StoragePath         string     `json:"storage_path"`
	ErrorMessage        string     `json:"error_message,omitempty"`
	StartedAt           *time.Time `json:"started_at"`
	CompletedAt         *time.Time `json:"completed_at"`
	RestoreStatus       string     `json:"restore_status,omitempty"`
	RestoredAt          *time.Time `json:"restored_at,omitempty"`
	Verified            *bool      `json:"verified"`
	VerifiedAt          *time.Time `json:"verified_at,omitempty"`
	VerificationDetails string     `json:"verification_details,omitempty"`
	VerificationError   string     `json:"verification_error,omitempty"`
}

type Schedule struct {
	ID             int        `json:"id"`
	ConnectionID   int        `json:"connection_id"`
	ConnectionName string     `json:"connection_name,omitempty"`
	CronExpression string     `json:"cron_expression"`
	Enabled        bool       `json:"enabled"`
	LastRun        *time.Time `json:"last_run"`
	NextRun        *time.Time `json:"next_run"`
	CreatedAt      time.Time  `json:"created_at"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type CreateConnectionRequest struct {
	Name              string `json:"name" binding:"required"`
	Type              string `json:"type" binding:"required"`
	Host              string `json:"host"`
	Port              int    `json:"port"`
	Database          string `json:"database" binding:"required"`
	Username          string `json:"username"`
	Password          string `json:"password"`
	RetentionDays     int    `json:"retention_days"`
	StorageProviderID *int   `json:"storage_provider_id"`
}

type CreateScheduleRequest struct {
	ConnectionID   int    `json:"connection_id" binding:"required"`
	CronExpression string `json:"cron_expression" binding:"required"`
}

type DashboardStats struct {
	TotalBackups    int    `json:"total_backups"`
	StorageUsed     int64  `json:"storage_used"`
	ActiveSchedules int    `json:"active_schedules"`
	LastBackupStatus string `json:"last_backup_status"`
}
