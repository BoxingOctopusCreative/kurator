package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/google/uuid"
)

const (
	defaultMaxImageBytes = 10 * 1024 * 1024
	httpFetchTimeout     = 45 * time.Second
)

var (
	ErrImageTooLarge      = errors.New("image exceeds size limit")
	ErrInvalidImage       = errors.New("file is not a supported image (jpeg, png, gif, webp)")
	ErrImageNotConfigured = errors.New("image storage is not configured")
)

// ImageService uploads binary image data to S3-compatible storage using GUID object keys.
type ImageService struct {
	bucket     string
	publicBase string
	keyPrefix  string
	client     *s3.Client
	maxBytes   int64
	httpClient *http.Client
}

// NewImageService returns nil when S3Bucket is empty (uploads disabled).
func NewImageService(bucket, region, endpoint, accessKey, secretKey, publicBaseURL, keyPrefix string) (*ImageService, error) {
	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return nil, nil
	}
	publicBaseURL = strings.TrimRight(strings.TrimSpace(publicBaseURL), "/")
	if publicBaseURL == "" {
		return nil, fmt.Errorf("S3_PUBLIC_BASE_URL is required when S3_BUCKET is set")
	}
	if region == "" {
		region = "us-east-1"
	}
	if keyPrefix == "" {
		keyPrefix = "covers"
	}
	keyPrefix = strings.Trim(keyPrefix, "/")

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

	s := &ImageService{
		bucket:     bucket,
		publicBase: publicBaseURL,
		keyPrefix:  keyPrefix,
		client:     client,
		maxBytes:   defaultMaxImageBytes,
		httpClient: &http.Client{Timeout: httpFetchTimeout},
	}
	if err := s.ensureBucket(ctx); err != nil {
		return nil, err
	}
	if strings.Contains(strings.ToLower(publicBaseURL), "r2.cloudflarestorage.com") {
		log.Printf(
			"image storage: S3_PUBLIC_BASE_URL uses the R2 S3 API host (*.r2.cloudflarestorage.com). " +
				"Browsers cannot load <img> URLs from that host without signing; use an R2 public custom domain (or r2.dev public URL) as public_base_url instead.",
		)
	}
	return s, nil
}

// Ping verifies the configured bucket is reachable (HeadBucket).
func (s *ImageService) Ping(ctx context.Context) error {
	if s == nil || s.bucket == "" {
		return ErrImageNotConfigured
	}
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)})
	return err
}

func (s *ImageService) ensureBucket(ctx context.Context) error {
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

// Configured reports whether uploads are available.
func (s *ImageService) Configured() bool {
	return s != nil && s.bucket != ""
}

// UploadBytes validates magic bytes, stores the object, and returns a public URL.
// kind is "" or "cover" for the configured key prefix (default "covers"), "avatar" for "avatars/", or "banner" for "banners/".
func (s *ImageService) UploadBytes(ctx context.Context, data []byte, kind string) (string, error) {
	if s == nil || s.bucket == "" {
		return "", ErrImageNotConfigured
	}
	if int64(len(data)) > s.maxBytes {
		return "", ErrImageTooLarge
	}
	mime, ext, ok := sniffImageType(data)
	if !ok || ext == "" {
		return "", ErrInvalidImage
	}
	folder := s.keyPrefix
	k := strings.ToLower(strings.TrimSpace(kind))
	if k == "avatar" || k == "avatars" {
		folder = "avatars"
	}
	if k == "banner" || k == "banners" {
		folder = "banners"
	}
	if k == "theme-logo" || k == "theme-logos" {
		folder = "theme-logos"
	}
	id := uuid.NewString()
	key := fmt.Sprintf("%s/%s%s", folder, id, ext)

	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(mime),
	})
	if err != nil {
		return "", err
	}
	out, err := url.JoinPath(s.publicBase, key)
	if err != nil {
		return "", fmt.Errorf("public image url: %w", err)
	}
	return out, nil
}

// UploadFromURL fetches a remote image and stores it like UploadBytes.
func (s *ImageService) UploadFromURL(ctx context.Context, rawURL string, kind string) (string, error) {
	if s == nil || s.bucket == "" {
		return "", ErrImageNotConfigured
	}
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", errors.New("url is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Kurator-ImageFetch/1.0")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetch failed: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, s.maxBytes+1))
	if err != nil {
		return "", err
	}
	if int64(len(body)) > s.maxBytes {
		return "", ErrImageTooLarge
	}
	return s.UploadBytes(ctx, body, kind)
}

func sniffImageType(b []byte) (mime, ext string, ok bool) {
	if len(b) < 12 {
		return "", "", false
	}
	if b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF {
		return "image/jpeg", ".jpg", true
	}
	if b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' {
		return "image/png", ".png", true
	}
	if len(b) >= 6 && (string(b[0:6]) == "GIF87a" || string(b[0:6]) == "GIF89a") {
		return "image/gif", ".gif", true
	}
	if string(b[0:4]) == "RIFF" && len(b) >= 12 && string(b[8:12]) == "WEBP" {
		return "image/webp", ".webp", true
	}
	return "", "", false
}
