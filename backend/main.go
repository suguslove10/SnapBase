package main

import (
	"log"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/audit"
	"github.com/suguslove10/snapbase/backup"
	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/crypto"
	"github.com/suguslove10/snapbase/handlers"
	"github.com/suguslove10/snapbase/models"
	"github.com/suguslove10/snapbase/notifications"
	"github.com/suguslove10/snapbase/retention"
	"github.com/suguslove10/snapbase/scheduler"
	"github.com/suguslove10/snapbase/storage"
	syncpkg "github.com/suguslove10/snapbase/sync"
)

func main() {
	cfg := config.Load()

	// Initialize AES-256 encryption — hard fail if key is missing or wrong length
	encKey := []byte(cfg.EncryptionKey)
	if len(encKey) != 32 {
		log.Fatalf("ENCRYPTION_KEY must be exactly 32 bytes (got %d). "+
			"Generate one with: openssl rand -hex 16 | tr -d '\\n'", len(encKey))
	}
	if err := crypto.Init(encKey); err != nil {
		log.Fatalf("Failed to initialise encryption: %v", err)
	}
	log.Println("AES-256-GCM encryption initialised")

	// Initialize database
	db := models.InitDB(cfg)
	defer db.Close()

	// Initialize MinIO storage (system default)
	store := storage.NewMinioStorage(cfg)

	// Seed default storage provider
	models.SeedDefaultStorageProvider(db, cfg.MinioEndpoint, cfg.MinioAccessKey, cfg.MinioSecretKey, cfg.MinioBucket, cfg.MinioUseSSL)

	// Initialize email notifications
	emailCfg := notifications.LoadEmailConfig()

	// Initialize verifier
	verifier := &backup.Verifier{DB: db, Storage: store, Cfg: cfg}

	// Initialize anomaly detector
	anomalyDetector := &backup.AnomalyDetector{DB: db}

	// Initialize backup runner
	runner := &backup.Runner{DB: db, Cfg: cfg, Storage: store, EmailConfig: emailCfg, Verifier: verifier, AnomalyDetector: anomalyDetector}

	// Initialize retention cleaner
	cleaner := &retention.Cleaner{DB: db, Storage: store}

	// Initialize scheduler
	sched := scheduler.New(db, runner)
	sched.Start()
	sched.AddRetentionJob(cleaner)
	defer sched.Stop()

	// Setup handlers
	auditLogger := &audit.Logger{DB: db}
	authHandler := &handlers.AuthHandler{DB: db, Cfg: cfg, AuditLogger: auditLogger, EmailConfig: emailCfg}
	connHandler := &handlers.ConnectionHandler{DB: db, AuditLogger: auditLogger}
	restoreRunner := &backup.RestoreRunner{DB: db, Storage: store}
	backupHandler := &handlers.BackupHandler{DB: db, Storage: store, Cfg: cfg, Runner: runner, RestoreRunner: restoreRunner, AuditLogger: auditLogger}
	schedHandler := &handlers.ScheduleHandler{DB: db, Scheduler: sched, AuditLogger: auditLogger}
	settingsHandler := &handlers.SettingsHandler{DB: db, Cfg: cfg, Storage: store}
	anomalyHandler := &handlers.AnomalyHandler{DB: db}
	auditHandler := &handlers.AuditHandler{DB: db}
	reportHandler := &handlers.ReportHandler{DB: db, Cfg: cfg}
	storageProviderHandler := &handlers.StorageProviderHandler{DB: db, Cfg: cfg}
	billingHandler := &handlers.BillingHandler{DB: db, Cfg: cfg}
	orgHandler := &handlers.OrgHandler{DB: db, EmailConfig: emailCfg}
	webhookHandler := &handlers.WebhookHandler{DB: db}

	syncRunner := &syncpkg.Runner{DB: db, Cfg: cfg, Storage: store, BackupRunner: runner, EmailConfig: emailCfg}
	syncHandler := handlers.NewSyncHandler(db, syncRunner, sched)
	syncHandler.LoadSchedules()

	// Setup router
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:3001", "http://localhost:5173", cfg.FrontendURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	oauthHandler := &handlers.OAuthHandler{DB: db, Cfg: cfg, AuditLogger: auditLogger}

	// Public routes
	r.POST("/api/billing/webhook", billingHandler.Webhook)
	r.GET("/api/invite/:token", orgHandler.GetInvite)
	r.POST("/api/auth/register", authHandler.Register)
	r.POST("/api/auth/login", authHandler.Login)
	r.POST("/api/auth/forgot-password", authHandler.ForgotPassword)
	r.POST("/api/auth/reset-password", authHandler.ResetPassword)
	r.GET("/api/auth/providers", oauthHandler.Providers)
	r.GET("/api/auth/google", oauthHandler.GoogleLogin)
	r.POST("/api/auth/google/callback", oauthHandler.GoogleCallback)
	r.GET("/api/auth/github", oauthHandler.GitHubLogin)
	r.POST("/api/auth/github/callback", oauthHandler.GitHubCallback)

	// Protected routes
	api := r.Group("/api")
	api.Use(handlers.AuthMiddleware(cfg))
	api.Use(handlers.OrgContextMiddleware(db))
	{
		api.GET("/auth/me", authHandler.Me)

		api.GET("/connections", connHandler.List)
		api.POST("/connections", connHandler.Create)
		api.PATCH("/connections/:id", connHandler.Update)
		api.DELETE("/connections/:id", connHandler.Delete)
		api.PATCH("/connections/:id/retention", connHandler.UpdateRetention)
		api.POST("/connections/:id/test", connHandler.TestConnection)
		api.PATCH("/connections/:id/storage", connHandler.UpdateStorageProvider)
		api.GET("/connections/:id/encryption", connHandler.GetEncryption)
		api.POST("/connections/:id/encryption", connHandler.SetEncryption)
		api.GET("/connections/:id/hooks", connHandler.ListHooks)
		api.POST("/connections/:id/hooks", connHandler.CreateHook)
		api.PUT("/connections/:id/hooks/:hook_id", connHandler.UpdateHook)
		api.DELETE("/connections/:id/hooks/:hook_id", connHandler.DeleteHook)
		api.GET("/connections/hooks/summary", connHandler.HookSummary)

		api.GET("/backups", backupHandler.List)
		api.POST("/backups/trigger/:id", backupHandler.Trigger)
		api.GET("/backups/:id/download", backupHandler.Download)
		api.POST("/backups/:id/restore", backupHandler.Restore)
		api.GET("/backups/stats", backupHandler.Stats)
		api.GET("/backups/chart", backupHandler.ChartData)
		api.GET("/backups/activity", backupHandler.ActivityFeed)
		api.GET("/connections/health", connHandler.Health)

		api.GET("/schedules", schedHandler.List)
		api.POST("/schedules", schedHandler.Create)
		api.PATCH("/schedules/:id", schedHandler.Update)
		api.DELETE("/schedules/:id", schedHandler.Delete)

		api.GET("/audit", auditHandler.List)
		api.POST("/reports/compliance", reportHandler.GenerateCompliance)

		api.GET("/anomalies", anomalyHandler.List)
		api.PATCH("/anomalies/:id/resolve", anomalyHandler.Resolve)
		api.GET("/anomalies/stats", anomalyHandler.Stats)

		api.PATCH("/auth/password", settingsHandler.ChangePassword)
		api.GET("/settings/notifications", settingsHandler.GetNotificationSettings)
		api.PATCH("/settings/notifications", settingsHandler.UpdateNotificationSettings)
		api.POST("/settings/notifications/test", settingsHandler.TestNotification)
		api.POST("/settings/slack/test", settingsHandler.TestSlack)
		api.GET("/settings/storage", settingsHandler.GetStorageInfo)

		api.GET("/storage-providers", storageProviderHandler.List)
		api.POST("/storage-providers", storageProviderHandler.Create)
		api.DELETE("/storage-providers/:id", storageProviderHandler.Delete)
		api.PATCH("/storage-providers/:id/default", storageProviderHandler.SetDefault)
		api.PATCH("/storage-providers/:id/keys", storageProviderHandler.UpdateKeys)
		api.POST("/storage-providers/test", storageProviderHandler.Test)

		api.GET("/billing/subscription", billingHandler.GetSubscription)
		api.GET("/billing/usage", billingHandler.GetUsage)
		api.POST("/billing/order", billingHandler.CreateOrder)
		api.POST("/billing/verify", billingHandler.VerifyPayment)

		api.GET("/org", orgHandler.GetOrg)
		api.PUT("/org", orgHandler.UpdateOrg)
		api.GET("/org/members", orgHandler.ListMembers)
		api.POST("/org/invite", orgHandler.InviteMember)
		api.DELETE("/org/members/:id", orgHandler.RemoveMember)
		api.PUT("/org/members/:id/role", orgHandler.UpdateMemberRole)
		api.GET("/org/invites", orgHandler.ListPendingInvites)
		api.DELETE("/org/invites/:id", orgHandler.DeleteInvite)
		api.POST("/invite/:token/accept", orgHandler.AcceptInvite)

		api.GET("/sync", syncHandler.List)
		api.POST("/sync", syncHandler.Create)
		api.PUT("/sync/:id", syncHandler.Update)
		api.DELETE("/sync/:id", syncHandler.Delete)
		api.POST("/sync/:id/run", syncHandler.TriggerRun)
		api.GET("/sync/:id/runs", syncHandler.Runs)

		api.GET("/webhooks", webhookHandler.List)
		api.POST("/webhooks", webhookHandler.Create)
		api.PUT("/webhooks/:id", webhookHandler.Update)
		api.DELETE("/webhooks/:id", webhookHandler.Delete)
		api.POST("/webhooks/:id/test", webhookHandler.Test)
		api.GET("/webhooks/:id/deliveries", webhookHandler.Deliveries)
	}

	log.Printf("Server starting on port %s", cfg.ServerPort)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
