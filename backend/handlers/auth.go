package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/models"
	"github.com/suguslove10/snapbase/notifications"
)

type AuthHandler struct {
	DB          *sql.DB
	Cfg         *config.Config
	AuditLogger interface{ LogAction(int, string, string, int, map[string]interface{}, string) }
	EmailConfig *notifications.EmailConfig
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
		Name     string `json:"name"`
		RefCode  string `json:"ref_code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
		return
	}

	// Check if email already exists
	var exists int
	h.DB.QueryRow("SELECT COUNT(*) FROM users WHERE email = $1", req.Email).Scan(&exists)
	if exists > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Email already registered"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	// Resolve referrer if a referral code was passed.
	var referredBy sql.NullInt64
	if req.RefCode != "" {
		var refID int
		if err := h.DB.QueryRow("SELECT id FROM users WHERE referral_code = $1", req.RefCode).Scan(&refID); err == nil {
			referredBy = sql.NullInt64{Int64: int64(refID), Valid: true}
		}
	}

	var userID int
	err = h.DB.QueryRow(
		`INSERT INTO users (email, password_hash, name, provider, referral_code, referred_by)
		 VALUES ($1, $2, $3, 'local', $4, $5) RETURNING id`,
		req.Email, string(hash), req.Name, generateReferralCode(req.Email), referredBy,
	).Scan(&userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Seed free subscription and personal workspace for new user
	seedFreeSubscription(h.DB, userID)
	seedOrgForUser(h.DB, userID, req.Email)

	c.JSON(http.StatusCreated, gin.H{"id": userID, "message": "Account created"})

	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "user.registered", "user", userID, nil, c.ClientIP())
	}
}

// generateReferralCode produces a short, URL-safe code unique-ish per email.
// Falls back to random if collision (caller can retry; we keep it best-effort).
func generateReferralCode(email string) string {
	b := make([]byte, 5)
	if _, err := rand.Read(b); err != nil {
		return "snap" + email
	}
	return strings.ToLower(hex.EncodeToString(b))
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var user models.User
	err := h.DB.QueryRow("SELECT id, email, password_hash, created_at FROM users WHERE email = $1", req.Email).
		Scan(&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	tokenString, err := signSessionToken(h.Cfg.JWTSecret, user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, models.LoginResponse{Token: tokenString, User: user})

	// Audit log
	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(user.ID, "user.login", "user", user.ID, nil, c.ClientIP())
	}
}

// signSessionToken issues a 7-day JWT. Tokens auto-renew on activity via /auth/refresh.
func signSessionToken(secret string, userID int, email string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"iat":     time.Now().Unix(),
		"exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
	})
	return token.SignedString([]byte(secret))
}

// RefreshToken issues a new 7-day token if the current one is still valid.
// Frontend calls this opportunistically; client uses sliding-window auth.
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	userID := c.GetInt("user_id")
	email := c.GetString("email")
	tok, err := signSessionToken(h.Cfg.JWTSecret, userID, email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to refresh"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": tok})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetInt("user_id")
	var email, provider string
	var name, avatarURL sql.NullString
	err := h.DB.QueryRow(
		"SELECT email, COALESCE(provider, 'local'), name, avatar_url FROM users WHERE id = $1", userID,
	).Scan(&email, &provider, &name, &avatarURL)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	var orgID sql.NullInt64
	var orgName, orgRole sql.NullString
	h.DB.QueryRow(`
		SELECT o.id, o.name, m.role
		FROM organizations o
		JOIN org_members m ON m.org_id = o.id
		WHERE m.user_id = $1
		ORDER BY (m.role = 'owner') ASC, o.created_at ASC
		LIMIT 1
	`, userID).Scan(&orgID, &orgName, &orgRole)

	resp := gin.H{
		"id":         userID,
		"email":      email,
		"provider":   provider,
		"name":       name.String,
		"avatar_url": avatarURL.String,
		"org_id":     nil,
		"org_name":   nil,
		"role":       nil,
	}
	if orgID.Valid && orgID.Int64 > 0 {
		resp["org_id"] = orgID.Int64
		resp["org_name"] = orgName.String
		resp["role"] = orgRole.String
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email is required"})
		return
	}

	// Always return success — never reveal whether an email exists
	success := gin.H{"message": "If that email exists, we sent a reset link"}

	var userID int
	var provider string
	err := h.DB.QueryRow(
		"SELECT id, COALESCE(provider, 'local') FROM users WHERE email = $1", req.Email,
	).Scan(&userID, &provider)
	if err != nil {
		c.JSON(http.StatusOK, success)
		return
	}

	// OAuth users have no password — skip silently
	if provider != "local" {
		c.JSON(http.StatusOK, success)
		return
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		c.JSON(http.StatusOK, success)
		return
	}
	tokenStr := hex.EncodeToString(tokenBytes)

	expiresAt := time.Now().Add(15 * time.Minute) // short-lived for security
	_, err = h.DB.Exec(
		"INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
		userID, tokenStr, expiresAt,
	)
	if err != nil {
		c.JSON(http.StatusOK, success)
		return
	}

	resetURL := fmt.Sprintf("%s/reset-password?token=%s", h.Cfg.FrontendURL, tokenStr)
	if h.EmailConfig != nil {
		notifications.SendPasswordResetEmail(h.EmailConfig, req.Email, resetURL)
	}

	c.JSON(http.StatusOK, success)
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req struct {
		Token       string `json:"token" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token and new_password are required"})
		return
	}

	if len(req.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
		return
	}

	var tokenID, userID int
	var expiresAt time.Time
	var usedAt sql.NullTime
	err := h.DB.QueryRow(
		"SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1",
		req.Token,
	).Scan(&tokenID, &userID, &expiresAt, &usedAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired reset link"})
		return
	}

	if time.Now().After(expiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This reset link has expired"})
		return
	}

	if usedAt.Valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This reset link has already been used"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	if _, err = h.DB.Exec("UPDATE users SET password_hash = $1 WHERE id = $2", string(hash), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	h.DB.Exec("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", tokenID)

	c.JSON(http.StatusOK, gin.H{"message": "Password updated successfully"})
}

func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		c.Set("user_id", int(claims["user_id"].(float64)))
		c.Set("email", claims["email"].(string))
		c.Next()
	}
}
