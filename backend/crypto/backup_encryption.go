package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"os"

	"golang.org/x/crypto/pbkdf2"
)

// DeriveKey derives a 32-byte AES-256 key from a password and salt using PBKDF2-SHA256.
func DeriveKey(password, salt string) []byte {
	return pbkdf2.Key([]byte(password), []byte(salt), 100_000, 32, sha256.New)
}

// EncryptFile encrypts inputPath using AES-256-GCM and writes the result to outputPath.
// Format: [12-byte nonce][GCM ciphertext+tag]
// key must be exactly 32 bytes.
func EncryptFile(inputPath, outputPath, key string) error {
	plaintext, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("encrypt: read input: %w", err)
	}

	keyBytes := []byte(key)
	if len(keyBytes) != 32 {
		return fmt.Errorf("encrypt: key must be 32 bytes, got %d", len(keyBytes))
	}

	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return fmt.Errorf("encrypt: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("encrypt: new GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize()) // 12 bytes
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return fmt.Errorf("encrypt: generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	out, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("encrypt: create output: %w", err)
	}
	defer out.Close()

	if _, err := out.Write(nonce); err != nil {
		return fmt.Errorf("encrypt: write nonce: %w", err)
	}
	if _, err := out.Write(ciphertext); err != nil {
		return fmt.Errorf("encrypt: write ciphertext: %w", err)
	}
	return nil
}

// DecryptFile decrypts a file produced by EncryptFile.
// Reads the 12-byte nonce from the start, then decrypts the remainder.
func DecryptFile(inputPath, outputPath, key string) error {
	data, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("decrypt: read input: %w", err)
	}

	keyBytes := []byte(key)
	if len(keyBytes) != 32 {
		return fmt.Errorf("decrypt: key must be 32 bytes, got %d", len(keyBytes))
	}

	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return fmt.Errorf("decrypt: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("decrypt: new GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return fmt.Errorf("decrypt: file too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return fmt.Errorf("decrypt: authentication failed (wrong password?): %w", err)
	}

	return os.WriteFile(outputPath, plaintext, 0600)
}
