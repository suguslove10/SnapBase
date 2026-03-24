package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/suguslove10/snapbase/config"
)

type MinioStorage struct {
	client *minio.Client
	bucket string
}

func NewMinioStorage(cfg *config.Config) *MinioStorage {
	client, err := minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
		Secure: cfg.MinioUseSSL,
	})
	if err != nil {
		// Non-fatal: backend starts without storage; backups will fail until fixed
		log.Printf("WARNING: Failed to create MinIO client: %v (storage unavailable)", err)
		return &MinioStorage{client: nil, bucket: cfg.MinioBucket}
	}

	// Ensure bucket exists — non-fatal so the backend starts even if MinIO is temporarily unreachable
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, cfg.MinioBucket)
	if err != nil {
		log.Printf("WARNING: Failed to check MinIO bucket %q: %v (will retry at backup time)", cfg.MinioBucket, err)
	} else if !exists {
		err = client.MakeBucket(ctx, cfg.MinioBucket, minio.MakeBucketOptions{})
		if err != nil {
			log.Printf("WARNING: Failed to create MinIO bucket %q: %v", cfg.MinioBucket, err)
		} else {
			log.Printf("Created MinIO bucket: %s", cfg.MinioBucket)
		}
	}

	return &MinioStorage{client: client, bucket: cfg.MinioBucket}
}

func (s *MinioStorage) Upload(path string, reader io.Reader, size int64) error {
	if s.client == nil {
		return fmt.Errorf("storage not available: check MINIO_ENDPOINT configuration")
	}
	ctx := context.Background()
	_, err := s.client.PutObject(ctx, s.bucket, path, reader, size, minio.PutObjectOptions{
		ContentType: "application/gzip",
	})
	return err
}

func (s *MinioStorage) GetPresignedURL(path string) (string, error) {
	if s.client == nil {
		return "", fmt.Errorf("storage not available: check MINIO_ENDPOINT configuration")
	}
	ctx := context.Background()
	reqParams := make(url.Values)
	presignedURL, err := s.client.PresignedGetObject(ctx, s.bucket, path, time.Hour, reqParams)
	if err != nil {
		return "", err
	}
	return presignedURL.String(), nil
}

func (s *MinioStorage) GetObject(path string) (*minio.Object, error) {
	if s.client == nil {
		return nil, fmt.Errorf("storage not available: check MINIO_ENDPOINT configuration")
	}
	ctx := context.Background()
	return s.client.GetObject(ctx, s.bucket, path, minio.GetObjectOptions{})
}

func (s *MinioStorage) Delete(path string) error {
	if s.client == nil {
		return fmt.Errorf("storage not available: check MINIO_ENDPOINT configuration")
	}
	ctx := context.Background()
	return s.client.RemoveObject(ctx, s.bucket, path, minio.RemoveObjectOptions{})
}
