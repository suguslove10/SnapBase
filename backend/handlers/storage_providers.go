package handlers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/suguslove10/snapbase/config"
	"github.com/suguslove10/snapbase/storage"
)

type StorageProviderHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

type StorageProviderResponse struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	ProviderType string    `json:"provider_type"`
	Endpoint     string    `json:"endpoint"`
	AccessKey    string    `json:"access_key"`
	Bucket       string    `json:"bucket"`
	Region       string    `json:"region"`
	UseSSL       bool      `json:"use_ssl"`
	IsDefault    bool      `json:"is_default"`
	CreatedAt    time.Time `json:"created_at"`
}

func (h *StorageProviderHandler) List(c *gin.Context) {
	userID := c.GetInt("user_id")
	rows, err := h.DB.Query(`
		SELECT id, name, provider_type, COALESCE(endpoint, ''), COALESCE(access_key, ''),
			bucket, COALESCE(region, ''), use_ssl, is_default, created_at
		FROM storage_providers WHERE user_id = $1 ORDER BY is_default DESC, created_at
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch providers"})
		return
	}
	defer rows.Close()

	var providers []StorageProviderResponse
	for rows.Next() {
		var p StorageProviderResponse
		if err := rows.Scan(&p.ID, &p.Name, &p.ProviderType, &p.Endpoint, &p.AccessKey,
			&p.Bucket, &p.Region, &p.UseSSL, &p.IsDefault, &p.CreatedAt); err != nil {
			continue
		}
		// Mask access key
		if len(p.AccessKey) > 4 {
			p.AccessKey = p.AccessKey[:4] + "••••••••"
		}
		providers = append(providers, p)
	}
	if providers == nil {
		providers = []StorageProviderResponse{}
	}
	c.JSON(http.StatusOK, providers)
}

func (h *StorageProviderHandler) Create(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Name         string `json:"name" binding:"required"`
		ProviderType string `json:"provider_type" binding:"required"`
		Endpoint     string `json:"endpoint"`
		AccessKey    string `json:"access_key" binding:"required"`
		SecretKey    string `json:"secret_key" binding:"required"`
		Bucket       string `json:"bucket" binding:"required"`
		Region       string `json:"region"`
		UseSSL       bool   `json:"use_ssl"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	validTypes := map[string]bool{"s3": true, "r2": true, "b2": true, "spaces": true, "wasabi": true, "minio": true}
	if !validTypes[req.ProviderType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid provider type"})
		return
	}

	encrypted, err := encryptSecret(req.SecretKey, h.Cfg.JWTSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encrypt secret"})
		return
	}

	var id int
	err = h.DB.QueryRow(`
		INSERT INTO storage_providers (user_id, name, provider_type, endpoint, access_key, secret_key_encrypted, bucket, region, use_ssl)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
	`, userID, req.Name, req.ProviderType, req.Endpoint, req.AccessKey, encrypted, req.Bucket, req.Region, req.UseSSL).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create provider"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Storage provider created"})
}

func (h *StorageProviderHandler) Delete(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	// Prevent deleting the default provider
	var isDefault bool
	h.DB.QueryRow("SELECT is_default FROM storage_providers WHERE id = $1 AND user_id = $2", id, userID).Scan(&isDefault)
	if isDefault {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete the default storage provider"})
		return
	}

	// Check if any connections use this provider
	var connCount int
	h.DB.QueryRow("SELECT COUNT(*) FROM db_connections WHERE storage_provider_id = $1", id).Scan(&connCount)
	if connCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Provider is used by %d connection(s). Reassign them first.", connCount)})
		return
	}

	result, err := h.DB.Exec("DELETE FROM storage_providers WHERE id = $1 AND user_id = $2", id, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete provider"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Provider not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Provider deleted"})
}

func (h *StorageProviderHandler) SetDefault(c *gin.Context) {
	userID := c.GetInt("user_id")
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	// Unset all defaults for this user, then set the chosen one
	tx, err := h.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update"})
		return
	}
	tx.Exec("UPDATE storage_providers SET is_default = false WHERE user_id = $1", userID)
	result, err := tx.Exec("UPDATE storage_providers SET is_default = true WHERE id = $1 AND user_id = $2", id, userID)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"error": "Provider not found"})
		return
	}
	tx.Commit()
	c.JSON(http.StatusOK, gin.H{"message": "Default provider updated"})
}

func (h *StorageProviderHandler) Test(c *gin.Context) {
	var req struct {
		ProviderType string `json:"provider_type" binding:"required"`
		Endpoint     string `json:"endpoint"`
		AccessKey    string `json:"access_key" binding:"required"`
		SecretKey    string `json:"secret_key" binding:"required"`
		Bucket       string `json:"bucket" binding:"required"`
		Region       string `json:"region"`
		UseSSL       bool   `json:"use_ssl"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := storage.TestConnection(storage.ProviderConfig{
		ProviderType: req.ProviderType,
		Endpoint:     req.Endpoint,
		AccessKey:    req.AccessKey,
		SecretKey:    req.SecretKey,
		Bucket:       req.Bucket,
		Region:       req.Region,
		UseSSL:       req.UseSSL,
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Connection successful"})
}

// GetStorageForConnection resolves the StorageClient for a given connection.
// Falls back to the user's default provider if no provider is assigned.
func GetStorageForConnection(db *sql.DB, cfg *config.Config, connID int, userID int) (storage.StorageClient, error) {
	var providerID sql.NullInt64
	db.QueryRow("SELECT storage_provider_id FROM db_connections WHERE id = $1", connID).Scan(&providerID)

	var query string
	var args []interface{}
	if providerID.Valid {
		query = "SELECT provider_type, COALESCE(endpoint,''), COALESCE(access_key,''), COALESCE(secret_key_encrypted,''), bucket, COALESCE(region,''), use_ssl FROM storage_providers WHERE id = $1"
		args = []interface{}{providerID.Int64}
	} else {
		query = "SELECT provider_type, COALESCE(endpoint,''), COALESCE(access_key,''), COALESCE(secret_key_encrypted,''), bucket, COALESCE(region,''), use_ssl FROM storage_providers WHERE user_id = $1 AND is_default = true"
		args = []interface{}{userID}
	}

	var pType, endpoint, accessKey, secretEnc, bucket, region string
	var useSSL bool
	err := db.QueryRow(query, args...).Scan(&pType, &endpoint, &accessKey, &secretEnc, &bucket, &region, &useSSL)
	if err != nil {
		// No custom provider — use the system default MinIO from env
		return storage.NewStorageClient(storage.ProviderConfig{
			ProviderType: "minio",
			Endpoint:     cfg.MinioEndpoint,
			AccessKey:    cfg.MinioAccessKey,
			SecretKey:    cfg.MinioSecretKey,
			Bucket:       cfg.MinioBucket,
			UseSSL:       cfg.MinioUseSSL,
		})
	}

	secretKey, err := decryptSecret(secretEnc, cfg.JWTSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt secret key: %w", err)
	}

	return storage.NewStorageClient(storage.ProviderConfig{
		ProviderType: pType,
		Endpoint:     endpoint,
		AccessKey:    accessKey,
		SecretKey:    secretKey,
		Bucket:       bucket,
		Region:       region,
		UseSSL:       useSSL,
	})
}

// AES-256 encryption helpers using the JWT secret as key (first 32 bytes, padded if needed)
func deriveKey(secret string) []byte {
	key := []byte(secret)
	if len(key) > 32 {
		key = key[:32]
	}
	for len(key) < 32 {
		key = append(key, 0)
	}
	return key
}

func encryptSecret(plaintext, secret string) (string, error) {
	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

func decryptSecret(encrypted, secret string) (string, error) {
	data, err := hex.DecodeString(encrypted)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := aesGCM.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	plaintext, err := aesGCM.Open(nil, data[:nonceSize], data[nonceSize:], nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
