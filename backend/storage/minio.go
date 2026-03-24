package storage

import (
	"context"
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
		log.Fatalf("Failed to create MinIO client: %v", err)
	}

	// Ensure bucket exists
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, cfg.MinioBucket)
	if err != nil {
		log.Fatalf("Failed to check bucket: %v", err)
	}
	if !exists {
		err = client.MakeBucket(ctx, cfg.MinioBucket, minio.MakeBucketOptions{})
		if err != nil {
			log.Fatalf("Failed to create bucket: %v", err)
		}
		log.Printf("Created MinIO bucket: %s", cfg.MinioBucket)
	}

	return &MinioStorage{client: client, bucket: cfg.MinioBucket}
}

func (s *MinioStorage) Upload(path string, reader io.Reader, size int64) error {
	ctx := context.Background()
	_, err := s.client.PutObject(ctx, s.bucket, path, reader, size, minio.PutObjectOptions{
		ContentType: "application/gzip",
	})
	return err
}

func (s *MinioStorage) GetPresignedURL(path string) (string, error) {
	ctx := context.Background()
	reqParams := make(url.Values)
	presignedURL, err := s.client.PresignedGetObject(ctx, s.bucket, path, time.Hour, reqParams)
	if err != nil {
		return "", err
	}
	return presignedURL.String(), nil
}

func (s *MinioStorage) GetObject(path string) (*minio.Object, error) {
	ctx := context.Background()
	return s.client.GetObject(ctx, s.bucket, path, minio.GetObjectOptions{})
}

func (s *MinioStorage) Delete(path string) error {
	ctx := context.Background()
	return s.client.RemoveObject(ctx, s.bucket, path, minio.RemoveObjectOptions{})
}
