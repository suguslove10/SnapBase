package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
)

var globalKey []byte

// Init sets the encryption key used by Encrypt/Decrypt.
// key must be exactly 32 bytes (AES-256). Call this at startup.
func Init(key []byte) error {
	if len(key) != 32 {
		return fmt.Errorf("ENCRYPTION_KEY must be exactly 32 bytes, got %d", len(key))
	}
	globalKey = make([]byte, 32)
	copy(globalKey, key)
	return nil
}

// Encrypt encrypts plaintext with AES-256-GCM and returns a hex-encoded ciphertext.
// SECURITY: credentials never returned to frontend — only encrypted form is stored.
func Encrypt(plaintext string) (string, error) {
	if len(globalKey) != 32 {
		return "", fmt.Errorf("encryption not initialised — call crypto.Init first")
	}
	block, err := aes.NewCipher(globalKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a hex-encoded AES-256-GCM ciphertext produced by Encrypt.
func Decrypt(encrypted string) (string, error) {
	if len(globalKey) != 32 {
		return "", fmt.Errorf("encryption not initialised — call crypto.Init first")
	}
	data, err := hex.DecodeString(encrypted)
	if err != nil {
		return "", fmt.Errorf("invalid ciphertext: %w", err)
	}
	block, err := aes.NewCipher(globalKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ns := gcm.NonceSize()
	if len(data) < ns {
		return "", fmt.Errorf("ciphertext too short")
	}
	plaintext, err := gcm.Open(nil, data[:ns], data[ns:], nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}
	return string(plaintext), nil
}
