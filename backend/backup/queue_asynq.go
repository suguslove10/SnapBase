package backup

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
	"github.com/suguslove10/snapbase/models"
)

const (
	TypeBackupRun = "backup:run"
)

type BackupTaskPayload struct {
	ConnectionID int  `json:"connection_id"`
	ScheduleID   *int `json:"schedule_id,omitempty"`
}

func NewBackupTask(connectionID int, scheduleID *int) (*asynq.Task, error) {
	payload, err := json.Marshal(BackupTaskPayload{
		ConnectionID: connectionID,
		ScheduleID:   scheduleID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal backup task payload: %w", err)
	}
	return asynq.NewTask(TypeBackupRun, payload), nil
}

type AsynqQueueClient struct {
	client *asynq.Client
}

func parseRedisConnOpt(redisAddr string) asynq.RedisConnOpt {
	opt, err := asynq.ParseRedisURI(redisAddr)
	if err == nil {
		return opt
	}
	return asynq.RedisClientOpt{Addr: redisAddr}
}

func NewAsynqQueueClient(redisAddr string) *AsynqQueueClient {
	client := asynq.NewClient(parseRedisConnOpt(redisAddr))
	return &AsynqQueueClient{client: client}
}

func (q *AsynqQueueClient) EnqueueBackup(connectionID int, scheduleID *int) error {
	task, err := NewBackupTask(connectionID, scheduleID)
	if err != nil {
		return err
	}
	info, err := q.client.Enqueue(task)
	if err != nil {
		return fmt.Errorf("failed to enqueue asynq backup task: %w", err)
	}
	log.Printf("[asynq-queue] enqueued backup task: id=%s queue=%s", info.ID, info.Queue)
	return nil
}

func (q *AsynqQueueClient) Close() {
	if q.client != nil {
		q.client.Close()
	}
}

type AsynqWorker struct {
	srv    *asynq.Server
	runner *Runner
}

func NewAsynqWorker(redisAddr string, concurrency int, runner *Runner) *AsynqWorker {
	srv := asynq.NewServer(
		parseRedisConnOpt(redisAddr),
		asynq.Config{
			Concurrency: concurrency,
			Queues: map[string]int{
				"critical": 6,
				"default":  3,
				"low":      1,
			},
		},
	)
	return &AsynqWorker{
		srv:    srv,
		runner: runner,
	}
}

func (w *AsynqWorker) Start() error {
	mux := asynq.NewServeMux()
	mux.HandleFunc(TypeBackupRun, w.handleBackupTask)

	log.Println("[asynq-worker] starting background task worker server")
	return w.srv.Run(mux)
}

func (w *AsynqWorker) handleBackupTask(ctx context.Context, t *asynq.Task) error {
	var payload BackupTaskPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal backup task payload: %w", err)
	}

	log.Printf("[asynq-worker] processing backup task for connection_id=%d", payload.ConnectionID)

	var conn models.DBConnection
	err := w.runner.DB.QueryRow(
		"SELECT id, user_id, name, type, host, port, database_name, username, COALESCE(password_encrypted, ''), retention_days, storage_provider_id, COALESCE(encryption_enabled, false), COALESCE(encryption_key_encrypted, ''), COALESCE(auth_source, '') FROM db_connections WHERE id = $1",
		payload.ConnectionID,
	).Scan(
		&conn.ID, &conn.UserID, &conn.Name, &conn.Type, &conn.Host, &conn.Port,
		&conn.Database, &conn.Username, &conn.PasswordEncrypted, &conn.RetentionDays,
		&conn.StorageProviderID, &conn.EncryptionEnabled, &conn.EncryptionKeyEncrypted, &conn.AuthSource,
	)
	if err != nil {
		return fmt.Errorf("connection %d not found: %w", payload.ConnectionID, err)
	}

	w.runner.RunBackup(conn, payload.ScheduleID)
	return nil
}
