package config

import "os"

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	JWTSecret  string
	MinioEndpoint  string
	MinioAccessKey string
	MinioSecretKey string
	MinioBucket    string
	MinioUseSSL    bool
	ServerPort     string
	FrontendURL    string
	GoogleClientID     string
	GoogleClientSecret string
	GitHubClientID     string
	GitHubClientSecret string
	EncryptionKey  string
	RazorpayKeyID            string
	RazorpayKeySecret        string
	RazorpayWebhookSecret    string
	// Razorpay plan IDs — create plans in Razorpay dashboard, paste IDs here.
	// Each plan represents a recurring price (monthly or annual).
	RazorpayPlanProMonthly   string
	RazorpayPlanProAnnual    string
	RazorpayPlanTeamMonthly  string
	RazorpayPlanTeamAnnual   string
	RazorpayPlanBusinessMonthly string
	RazorpayPlanBusinessAnnual  string
	// Storage add-on plans
	RazorpayPlanStorage50    string
	RazorpayPlanStorage100   string
	OpenAIAPIKey      string
	Env               string // "production" | "development"
}

func Load() *Config {
	return &Config{
		DBHost:         getEnv("DB_HOST", "localhost"),
		DBPort:         getEnv("DB_PORT", "5432"),
		DBUser:         getEnv("DB_USER", "dbbackup"),
		DBPassword:     getEnv("DB_PASSWORD", "dbbackup"),
		DBName:         getEnv("DB_NAME", "dbbackup"),
		JWTSecret:      getEnv("JWT_SECRET", "change-me-in-production"),
		MinioEndpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinioSecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinioBucket:    getEnv("MINIO_BUCKET", "backups"),
		MinioUseSSL:    getEnv("MINIO_USE_SSL", "false") == "true",
		ServerPort:     getEnv("SERVER_PORT", "8080"),
		FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:3000"),
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GitHubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		EncryptionKey:  getEnv("ENCRYPTION_KEY", ""),
		RazorpayKeyID:            getEnv("RAZORPAY_KEY_ID", ""),
		RazorpayKeySecret:        getEnv("RAZORPAY_KEY_SECRET", ""),
		RazorpayWebhookSecret:    getEnv("RAZORPAY_WEBHOOK_SECRET", ""),
		RazorpayPlanProMonthly:   getEnv("RAZORPAY_PLAN_PRO_MONTHLY", ""),
		RazorpayPlanProAnnual:    getEnv("RAZORPAY_PLAN_PRO_ANNUAL", ""),
		RazorpayPlanTeamMonthly:  getEnv("RAZORPAY_PLAN_TEAM_MONTHLY", ""),
		RazorpayPlanTeamAnnual:   getEnv("RAZORPAY_PLAN_TEAM_ANNUAL", ""),
		RazorpayPlanBusinessMonthly: getEnv("RAZORPAY_PLAN_BUSINESS_MONTHLY", ""),
		RazorpayPlanBusinessAnnual:  getEnv("RAZORPAY_PLAN_BUSINESS_ANNUAL", ""),
		RazorpayPlanStorage50:    getEnv("RAZORPAY_PLAN_STORAGE_50GB", ""),
		RazorpayPlanStorage100:   getEnv("RAZORPAY_PLAN_STORAGE_100GB", ""),
		OpenAIAPIKey:      getEnv("OPENAI_API_KEY", ""),
		Env:               getEnv("APP_ENV", "development"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
