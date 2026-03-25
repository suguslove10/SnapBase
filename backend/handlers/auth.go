package handlers

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/models"
)

type AuthHandler struct {
	DB           *sql.DB
	Cfg          *config.Config
	AuditLogger  interface{ LogAction(int, string, string, int, map[string]interface{}, string) }
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
		Name     string `json:"name"`
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

	var userID int
	err = h.DB.QueryRow(
		"INSERT INTO users (email, password_hash, name, provider) VALUES ($1, $2, $3, 'local') RETURNING id",
		req.Email, string(hash), req.Name,
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

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	})

	tokenString, err := token.SignedString([]byte(h.Cfg.JWTSecret))
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
