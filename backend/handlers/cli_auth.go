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

	"github.com/suguslove10/snapbase/config"
)

type CLIAuthHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

// Init creates a new CLI auth session and returns a one-time code + poll token.
// Public endpoint — called by the CLI before opening the browser.
func (h *CLIAuthHandler) Init(c *gin.Context) {
	// Generate a readable one-time code: XXXX-XXXX
	codeBytes := make([]byte, 4)
	rand.Read(codeBytes)
	code := fmt.Sprintf("%s-%s",
		strings.ToUpper(hex.EncodeToString(codeBytes[:2])),
		strings.ToUpper(hex.EncodeToString(codeBytes[2:])),
	)

	// Generate an opaque poll token
	pollBytes := make([]byte, 32)
	rand.Read(pollBytes)
	pollToken := hex.EncodeToString(pollBytes)

	expiresAt := time.Now().Add(10 * time.Minute)

	_, err := h.DB.Exec(
		`INSERT INTO cli_auth_sessions (code, poll_token, expires_at) VALUES ($1, $2, $3)`,
		code, pollToken, expiresAt,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create auth session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":        code,
		"poll_token":  pollToken,
		"expires_at":  expiresAt.Format(time.RFC3339),
	})
}

// Poll checks whether a CLI auth session has been approved by the user.
// Returns {status: "pending"} or {status: "complete", jwt: "..."}.
// Public endpoint — called by the CLI while waiting for user approval.
func (h *CLIAuthHandler) Poll(c *gin.Context) {
	pollToken := c.Param("token")

	var jwtStr sql.NullString
	var expiresAt time.Time
	err := h.DB.QueryRow(
		`SELECT COALESCE(jwt,''), expires_at FROM cli_auth_sessions WHERE poll_token = $1`,
		pollToken,
	).Scan(&jwtStr, &expiresAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}
	if time.Now().After(expiresAt) {
		c.JSON(http.StatusGone, gin.H{"error": "Session expired"})
		return
	}

	if jwtStr.String == "" {
		c.JSON(http.StatusOK, gin.H{"status": "pending"})
		return
	}

	// Clean up the session
	h.DB.Exec(`DELETE FROM cli_auth_sessions WHERE poll_token = $1`, pollToken)

	c.JSON(http.StatusOK, gin.H{"status": "complete", "jwt": jwtStr.String})
}

// Complete is called by the web frontend after the logged-in user approves CLI access.
// Protected endpoint — requires web JWT.
func (h *CLIAuthHandler) Complete(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		PollToken string `json:"poll_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "poll_token is required"})
		return
	}

	// Verify session exists and is not expired
	var sessionID int
	var expiresAt time.Time
	err := h.DB.QueryRow(
		`SELECT id, expires_at FROM cli_auth_sessions WHERE poll_token = $1 AND jwt IS NULL`,
		req.PollToken,
	).Scan(&sessionID, &expiresAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found or already completed"})
		return
	}
	if time.Now().After(expiresAt) {
		c.JSON(http.StatusGone, gin.H{"error": "Session expired"})
		return
	}

	// Get user email
	var email string
	h.DB.QueryRow("SELECT email FROM users WHERE id = $1", userID).Scan(&email)

	// Generate a 30-day CLI JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(30 * 24 * time.Hour).Unix(),
		"source":  "cli",
	})
	tokenString, err := token.SignedString([]byte(h.Cfg.JWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Store JWT in session so CLI can pick it up via Poll
	_, err = h.DB.Exec(
		`UPDATE cli_auth_sessions SET user_id = $1, jwt = $2 WHERE id = $3`,
		userID, tokenString, sessionID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete auth"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "CLI authorized", "email": email})
}
