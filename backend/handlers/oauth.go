package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"github.com/suguslove10/snapbase/config"
)

type OAuthHandler struct {
	DB          *sql.DB
	Cfg         *config.Config
	AuditLogger interface{ LogAction(int, string, string, int, map[string]interface{}, string) }
}

// GoogleLogin redirects to Google OAuth consent screen
func (h *OAuthHandler) GoogleLogin(c *gin.Context) {
	if h.Cfg.GoogleClientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Google OAuth not configured"})
		return
	}
	redirectURI := h.Cfg.FrontendURL + "/auth/callback?provider=google"
	authURL := fmt.Sprintf(
		"https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&access_type=offline",
		url.QueryEscape(h.Cfg.GoogleClientID),
		url.QueryEscape(redirectURI),
		url.QueryEscape("openid email profile"),
	)
	c.JSON(http.StatusOK, gin.H{"url": authURL})
}

// GoogleCallback exchanges code for token and creates/logs in user
func (h *OAuthHandler) GoogleCallback(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code is required"})
		return
	}

	redirectURI := h.Cfg.FrontendURL + "/auth/callback?provider=google"

	// Exchange code for token
	tokenResp, err := http.PostForm("https://oauth2.googleapis.com/token", url.Values{
		"code":          {req.Code},
		"client_id":     {h.Cfg.GoogleClientID},
		"client_secret": {h.Cfg.GoogleClientSecret},
		"redirect_uri":  {redirectURI},
		"grant_type":    {"authorization_code"},
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to exchange code"})
		return
	}
	defer tokenResp.Body.Close()

	var tokenData struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil || tokenData.AccessToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get access token"})
		return
	}

	// Get user info
	userResp, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + tokenData.AccessToken)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get user info"})
		return
	}
	defer userResp.Body.Close()

	var gUser struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&gUser); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse user info"})
		return
	}

	h.oauthLoginOrCreate(c, "google", gUser.ID, gUser.Email, gUser.Name, gUser.Picture)
}

// GitHubLogin redirects to GitHub OAuth
func (h *OAuthHandler) GitHubLogin(c *gin.Context) {
	if h.Cfg.GitHubClientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub OAuth not configured"})
		return
	}
	redirectURI := h.Cfg.FrontendURL + "/auth/callback?provider=github"
	authURL := fmt.Sprintf(
		"https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&scope=%s",
		url.QueryEscape(h.Cfg.GitHubClientID),
		url.QueryEscape(redirectURI),
		url.QueryEscape("user:email"),
	)
	c.JSON(http.StatusOK, gin.H{"url": authURL})
}

// GitHubCallback exchanges code for token and creates/logs in user
func (h *OAuthHandler) GitHubCallback(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code is required"})
		return
	}

	// Exchange code for token
	tokenReq, _ := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(url.Values{
		"code":          {req.Code},
		"client_id":     {h.Cfg.GitHubClientID},
		"client_secret": {h.Cfg.GitHubClientSecret},
	}.Encode()))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenReq.Header.Set("Accept", "application/json")

	client := &http.Client{}
	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to exchange code"})
		return
	}
	defer tokenResp.Body.Close()

	var tokenData struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil || tokenData.AccessToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get access token"})
		return
	}

	// Get user info
	userReq, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
	userReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
	userResp, err := client.Do(userReq)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get user info"})
		return
	}
	defer userResp.Body.Close()

	var ghUser struct {
		ID        int    `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&ghUser); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse user info"})
		return
	}

	// If email is private, fetch from emails endpoint
	if ghUser.Email == "" {
		emailReq, _ := http.NewRequest("GET", "https://api.github.com/user/emails", nil)
		emailReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
		emailResp, err := client.Do(emailReq)
		if err == nil {
			defer emailResp.Body.Close()
			body, _ := io.ReadAll(emailResp.Body)
			var emails []struct {
				Email    string `json:"email"`
				Primary  bool   `json:"primary"`
				Verified bool   `json:"verified"`
			}
			if json.Unmarshal(body, &emails) == nil {
				for _, e := range emails {
					if e.Primary && e.Verified {
						ghUser.Email = e.Email
						break
					}
				}
			}
		}
	}

	name := ghUser.Name
	if name == "" {
		name = ghUser.Login
	}

	h.oauthLoginOrCreate(c, "github", fmt.Sprintf("%d", ghUser.ID), ghUser.Email, name, ghUser.AvatarURL)
}

// OAuthProviders returns which OAuth providers are configured
func (h *OAuthHandler) Providers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"google": h.Cfg.GoogleClientID != "",
		"github": h.Cfg.GitHubClientID != "",
	})
}

func (h *OAuthHandler) oauthLoginOrCreate(c *gin.Context, provider, providerID, email, name, avatarURL string) {
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email not available from provider"})
		return
	}

	var userID int
	var userEmail string

	// Check if user exists by provider+provider_id
	err := h.DB.QueryRow(
		"SELECT id, email FROM users WHERE provider = $1 AND provider_id = $2",
		provider, providerID,
	).Scan(&userID, &userEmail)

	if err == sql.ErrNoRows {
		// Check if user exists by email (link accounts)
		err = h.DB.QueryRow("SELECT id, email FROM users WHERE email = $1", email).Scan(&userID, &userEmail)
		if err == sql.ErrNoRows {
			// Create new user
			err = h.DB.QueryRow(
				"INSERT INTO users (email, provider, provider_id, avatar_url, name) VALUES ($1, $2, $3, $4, $5) RETURNING id",
				email, provider, providerID, avatarURL, name,
			).Scan(&userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
				return
			}
			userEmail = email

			// Seed free subscription for new OAuth user
			seedFreeSubscription(h.DB, userID)

			// Seed default storage provider for new OAuth user
			h.DB.Exec(`
				INSERT INTO storage_providers (user_id, name, provider_type, endpoint, access_key, secret_key_encrypted, bucket, use_ssl, is_default)
				SELECT $1, 'Local MinIO (Default)', 'minio', endpoint, access_key, secret_key_encrypted, bucket, use_ssl, true
				FROM storage_providers WHERE is_default = true AND user_id != $1 LIMIT 1
			`, userID)
		} else if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		} else {
			// Link existing email user to OAuth provider
			h.DB.Exec("UPDATE users SET provider = $1, provider_id = $2, avatar_url = $3, name = $4 WHERE id = $5",
				provider, providerID, avatarURL, name, userID)
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	} else {
		// Update avatar/name on login
		h.DB.Exec("UPDATE users SET avatar_url = $1, name = $2 WHERE id = $3", avatarURL, name, userID)
	}

	// Generate JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"email":   userEmail,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	})
	tokenString, err := token.SignedString([]byte(h.Cfg.JWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": tokenString,
		"user": gin.H{
			"id":         userID,
			"email":      userEmail,
			"name":       name,
			"avatar_url": avatarURL,
			"provider":   provider,
		},
	})

	if h.AuditLogger != nil {
		h.AuditLogger.LogAction(userID, "user.oauth_login", "user", userID, map[string]interface{}{"provider": provider}, c.ClientIP())
	}
}
