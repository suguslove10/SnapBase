package storage

import (
	"context"
	"io"
	"log"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// StorageClient is the interface all storage backends implement.
type StorageClient interface {
	Upload(path string, reader io.Reader, size int64) error
	GetPresignedURL(path string) (string, error)
	GetObject(path string) (*minio.Object, error)
	Delete(path string) error
}

// ProviderConfig holds the details to construct an S3-compatible client.
type ProviderConfig struct {
	ProviderType string
	Endpoint     string
	AccessKey    string
	SecretKey    string
	Bucket       string
	Region       string
	UseSSL       bool
}

// NewStorageClient builds the correct MinIO Go client based on provider type.
func NewStorageClient(p ProviderConfig) (StorageClient, error) {
	endpoint := p.Endpoint
	useSSL := p.UseSSL

	switch p.ProviderType {
	case "s3":
		endpoint = "s3.amazonaws.com"
		if p.Region != "" {
			endpoint = "s3." + p.Region + ".amazonaws.com"
		}
		useSSL = true
	case "r2":
		// Endpoint should be {accountID}.r2.cloudflarestorage.com
		useSSL = true
	case "b2":
		if endpoint == "" {
			endpoint = "s3.us-west-004.backblazeb2.com"
		}
		useSSL = true
	case "spaces":
		if p.Region != "" {
			endpoint = p.Region + ".digitaloceanspaces.com"
		}
		useSSL = true
	case "wasabi":
		endpoint = "s3.wasabisys.com"
		if p.Region != "" {
			endpoint = "s3." + p.Region + ".wasabisys.com"
		}
		useSSL = true
	case "minio":
		// Use endpoint as-is from user input
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(p.AccessKey, p.SecretKey, ""),
		Secure: useSSL,
		Region: p.Region,
	})
	if err != nil {
		return nil, err
	}

	s := &s3Storage{client: client, bucket: p.Bucket}

	// Ensure bucket exists (best effort)
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, p.Bucket)
	if err != nil {
		log.Printf("Warning: could not check bucket %s: %v", p.Bucket, err)
	} else if !exists {
		err = client.MakeBucket(ctx, p.Bucket, minio.MakeBucketOptions{Region: p.Region})
		if err != nil {
			log.Printf("Warning: could not create bucket %s: %v", p.Bucket, err)
		} else {
			log.Printf("Created bucket: %s", p.Bucket)
		}
	}

	return s, nil
}

// s3Storage implements StorageClient using the MinIO Go SDK.
type s3Storage struct {
	client *minio.Client
	bucket string
}

func (s *s3Storage) Upload(path string, reader io.Reader, size int64) error {
	ctx := context.Background()
	_, err := s.client.PutObject(ctx, s.bucket, path, reader, size, minio.PutObjectOptions{
		ContentType: "application/gzip",
	})
	return err
}

func (s *s3Storage) GetPresignedURL(path string) (string, error) {
	ctx := context.Background()
	reqParams := make(url.Values)
	presignedURL, err := s.client.PresignedGetObject(ctx, s.bucket, path, time.Hour, reqParams)
	if err != nil {
		return "", err
	}
	return presignedURL.String(), nil
}

func (s *s3Storage) GetObject(path string) (*minio.Object, error) {
	ctx := context.Background()
	return s.client.GetObject(ctx, s.bucket, path, minio.GetObjectOptions{})
}

func (s *s3Storage) Delete(path string) error {
	ctx := context.Background()
	return s.client.RemoveObject(ctx, s.bucket, path, minio.RemoveObjectOptions{})
}

// TestConnection validates the provider can list the bucket.
func TestConnection(p ProviderConfig) error {
	client, err := NewStorageClient(p)
	if err != nil {
		return err
	}
	// Try a simple operation
	s := client.(*s3Storage)
	ctx := context.Background()
	_, err = s.client.BucketExists(ctx, p.Bucket)
	return err
}
