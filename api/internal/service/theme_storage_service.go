package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

var ErrThemeStorageNotConfigured = errors.New("theme storage is not configured")

// ThemeStorageService stores custom theme YAML in S3-compatible storage.
type ThemeStorageService struct {
	bucket string
	client *s3.Client
}

func NewThemeStorageService(bucket, region, endpoint, accessKey, secretKey string) (*ThemeStorageService, error) {
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, nil
	}
	if region == "" {
		region = "us-east-1"
	}
	ctx := context.Background()
	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = true
		if endpoint != "" {
			o.BaseEndpoint = aws.String(strings.TrimRight(endpoint, "/"))
		}
	})
	s := &ThemeStorageService{bucket: bucket, client: client}
	if err := s.ensureBucket(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *ThemeStorageService) Configured() bool {
	return s != nil && s.bucket != ""
}

func (s *ThemeStorageService) ensureBucket(ctx context.Context) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)})
	if err == nil {
		return nil
	}
	_, err = s.client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(s.bucket)})
	if err == nil {
		return nil
	}
	var bae *types.BucketAlreadyExists
	if errors.As(err, &bae) {
		return nil
	}
	var bao *types.BucketAlreadyOwnedByYou
	if errors.As(err, &bao) {
		return nil
	}
	return err
}

func (s *ThemeStorageService) PutUserTheme(ctx context.Context, key string, yaml []byte) error {
	if s == nil || !s.Configured() {
		return ErrThemeStorageNotConfigured
	}
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(yaml),
		ContentType: aws.String("application/x-yaml"),
	})
	return err
}

// PutPublishedTheme stores an immutable published artifact; fails if the key already exists.
func (s *ThemeStorageService) PutPublishedTheme(ctx context.Context, key string, yaml []byte) error {
	if s == nil || !s.Configured() {
		return ErrThemeStorageNotConfigured
	}
	_, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err == nil {
		return fmt.Errorf("published theme object already exists")
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(yaml),
		ContentType: aws.String("application/x-yaml"),
	})
	return err
}

func (s *ThemeStorageService) GetTheme(ctx context.Context, key string) ([]byte, error) {
	if s == nil || !s.Configured() {
		return nil, ErrThemeStorageNotConfigured
	}
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(io.LimitReader(out.Body, customThemeMaxBytes+1))
}

func (s *ThemeStorageService) DeleteTheme(ctx context.Context, key string) error {
	if s == nil || !s.Configured() || strings.TrimSpace(key) == "" {
		return nil
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

func UserThemeS3Key(userID int64, themeID string) string {
	return fmt.Sprintf("themes/%d/%s/theme.yaml", userID, themeID)
}

func LibraryThemeS3Key(userID int64, libraryID string) string {
	return fmt.Sprintf("themes/%d/library/%s/theme.yaml", userID, libraryID)
}

func PublishedThemeS3Key(themeFamilyID string, version int) string {
	return fmt.Sprintf("themes/published/%s/v%d/theme.yaml", themeFamilyID, version)
}

func (s *ThemeStorageService) CopyTheme(ctx context.Context, srcKey, destKey string) error {
	if s == nil || !s.Configured() {
		return ErrThemeStorageNotConfigured
	}
	data, err := s.GetTheme(ctx, srcKey)
	if err != nil {
		return err
	}
	return s.PutUserTheme(ctx, destKey, data)
}
