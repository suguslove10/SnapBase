package storage

import (
	"fmt"
	"io"
	"log"
	"math"
	"time"
)

// UploadWithRetry uploads to storage with exponential backoff.
// Attempts: 1s → 2s → 4s between retries (maxRetries=3 means 3 total attempts).
func UploadWithRetry(client StorageClient, path string, reader io.ReadSeeker, size int64, maxRetries int) error {
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			// Seek back to start so the reader can be re-read
			if _, err := reader.Seek(0, io.SeekStart); err != nil {
				return fmt.Errorf("upload retry: failed to seek reader: %w", err)
			}
		}
		err := client.Upload(path, reader, size)
		if err == nil {
			return nil
		}
		lastErr = err
		if attempt < maxRetries {
			waitTime := time.Duration(math.Pow(2, float64(attempt-1))) * time.Second
			log.Printf("Upload attempt %d/%d failed, retrying in %v: %v", attempt, maxRetries, waitTime, err)
			time.Sleep(waitTime)
		}
	}
	return fmt.Errorf("upload failed after %d attempts: %w", maxRetries, lastErr)
}
