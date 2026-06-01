package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

const customThemeMaxUploadsPerDay = 10

type CustomThemeService struct {
	repo        repository.CustomThemeRepository
	users       repository.UserRepository
	notif       *repository.PostgresNotificationRepository
	storage     *ThemeStorageService
	images      *ImageService
	googleFonts GoogleFontsValidator
	iconify     IconifyValidator
	publicWeb   string
	httpClient  *http.Client
}

func NewCustomThemeService(
	repo repository.CustomThemeRepository,
	users repository.UserRepository,
	notif *repository.PostgresNotificationRepository,
	storage *ThemeStorageService,
	images *ImageService,
	googleFonts GoogleFontsValidator,
	iconify IconifyValidator,
	publicWebBaseURL string,
) *CustomThemeService {
	return &CustomThemeService{
		repo:        repo,
		users:       users,
		notif:       notif,
		storage:     storage,
		images:      images,
		googleFonts: googleFonts,
		iconify:     iconify,
		publicWeb:   strings.TrimRight(strings.TrimSpace(publicWebBaseURL), "/"),
		httpClient:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *CustomThemeService) ValidateYAML(ctx context.Context, userID int64, raw []byte) ValidationResult {
	if err := s.requirePro(ctx, userID); err != nil {
		return ValidationResult{Errors: []FieldError{{Field: "plan", Message: err.Error()}}}
	}
	result := ParseAndValidateCustomThemeYAML(raw, s.googleFonts, s.iconify)
	if !result.Valid {
		return result
	}
	if err := s.validateLogoReachable(ctx, result.Theme.Branding.Logo.URL); err != nil {
		return ValidationResult{Errors: []FieldError{{Field: "customTheme.branding.logo.url", Message: err.Error()}}}
	}
	return result
}

func (s *CustomThemeService) ListGoogleFonts(ctx context.Context, userID int64) ([]string, error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return nil, err
	}
	if s.googleFonts == nil {
		return nil, nil
	}
	return s.googleFonts.ListFontFamilies(), nil
}

func (s *CustomThemeService) GetMine(ctx context.Context, userID int64) (*models.UserCustomTheme, error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return nil, err
	}
	row, err := s.repo.GetUserTheme(ctx, userID)
	if errors.Is(err, repository.ErrCustomThemeNotFound) {
		doc := DefaultCustomThemeDocument()
		yamlBytes, err := MarshalCustomThemeYAML(doc)
		if err != nil {
			return nil, err
		}
		return &models.UserCustomTheme{
			UserID:      userID,
			Name:        doc.CustomTheme.Meta.Name,
			Description: doc.CustomTheme.Meta.Description,
			YAML:        string(yamlBytes),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	if s.storage != nil && s.storage.Configured() {
		data, err := s.storage.GetTheme(ctx, row.S3Key)
		if err != nil {
			return nil, err
		}
		row.YAML = string(data)
	}
	return row, nil
}

func (s *CustomThemeService) Save(ctx context.Context, userID int64, raw []byte) (*models.UserCustomTheme, ValidationResult, error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return nil, ValidationResult{}, err
	}
	result := s.ValidateYAML(ctx, userID, raw)
	if !result.Valid {
		return nil, result, nil
	}
	if err := s.checkRateLimit(ctx, userID); err != nil {
		return nil, ValidationResult{}, err
	}
	if s.storage == nil || !s.storage.Configured() {
		return nil, ValidationResult{}, ErrThemeStorageNotConfigured
	}

	theme := result.Theme
	proxiedLogo, err := s.proxyLogo(ctx, theme.Branding.Logo.URL)
	if err != nil {
		return nil, ValidationResult{Errors: []FieldError{{Field: "customTheme.branding.logo.url", Message: err.Error()}}}, nil
	}
	theme.Branding.Logo.URL = proxiedLogo
	doc := models.CustomThemeDocument{CustomTheme: *theme}
	yamlBytes, err := MarshalCustomThemeYAML(doc)
	if err != nil {
		return nil, ValidationResult{}, err
	}

	existing, existingErr := s.repo.GetUserTheme(ctx, userID)
	themeID := uuid.New()
	if existingErr == nil {
		themeID = existing.ThemeID
		if existing.S3Key != "" {
			_ = s.storage.DeleteTheme(ctx, existing.S3Key)
		}
	}
	key := UserThemeS3Key(userID, themeID.String())
	if err := s.storage.PutUserTheme(ctx, key, yamlBytes); err != nil {
		return nil, ValidationResult{}, err
	}
	row := &models.UserCustomTheme{
		UserID:      userID,
		ThemeID:     themeID,
		Name:        theme.Meta.Name,
		Description: theme.Meta.Description,
		S3Key:       key,
		YAML:        string(yamlBytes),
	}
	if err := s.repo.UpsertUserTheme(ctx, row); err != nil {
		return nil, ValidationResult{}, err
	}
	if err := s.repo.RecordUpload(ctx, userID); err != nil {
		return nil, ValidationResult{}, err
	}
	if err := s.syncOwnLibraryEntry(ctx, row); err != nil {
		return nil, ValidationResult{}, err
	}
	return row, result, nil
}

func (s *CustomThemeService) Reset(ctx context.Context, userID int64) error {
	if err := s.requirePro(ctx, userID); err != nil {
		return err
	}
	existing, err := s.repo.GetUserTheme(ctx, userID)
	if errors.Is(err, repository.ErrCustomThemeNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := s.ensureThemeUnpublished(ctx, existing.ThemeID, userID); err != nil {
		return err
	}
	return s.deleteUserDraft(ctx, userID, existing)
}

// Unpublish removes all published marketplace versions for the user's theme family.
func (s *CustomThemeService) Unpublish(ctx context.Context, userID int64) (themeName string, activeCleared bool, err error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return "", false, err
	}
	userTheme, err := s.repo.GetUserTheme(ctx, userID)
	if errors.Is(err, repository.ErrCustomThemeNotFound) {
		return "", false, ErrCustomThemeNotFound
	}
	if err != nil {
		return "", false, err
	}
	published, err := s.repo.ListPublishedByFamilyAndAuthor(ctx, userTheme.ThemeID, userID)
	if err != nil {
		return "", false, err
	}
	if len(published) == 0 {
		return "", false, ErrCustomThemeNotPublished
	}
	themeName = published[0].Name
	publishedIDs := make([]uuid.UUID, 0, len(published))
	publishedKeys := make([]string, 0, len(published))
	for _, row := range published {
		publishedIDs = append(publishedIDs, row.ID)
		if row.S3Key != "" {
			publishedKeys = append(publishedKeys, row.S3Key)
		}
	}

	affectedUsers, err := s.repo.ListUsersWithActiveCustomThemeForUnpublish(ctx, userID, userTheme.ThemeID, publishedIDs)
	if err != nil {
		return "", false, err
	}
	for _, uid := range affectedUsers {
		if uid == userID {
			activeCleared = true
		}
		if err := s.users.UpdateActiveCustomThemeLibrary(ctx, uid, nil); err != nil {
			return "", false, err
		}
	}

	payload, err := json.Marshal(map[string]string{
		"theme_name":      themeName,
		"theme_family_id": userTheme.ThemeID.String(),
	})
	if err != nil {
		return "", false, err
	}
	for _, uid := range affectedUsers {
		if uid == userID {
			continue
		}
		_ = s.notif.InsertOne(ctx, uid, userID, models.NotificationKindCustomThemeUnpublished, payload)
	}

	libraryEntries, err := s.repo.ListMarketplaceLibraryByPublishedIDs(ctx, publishedIDs)
	if err != nil {
		return "", false, err
	}
	for _, entry := range libraryEntries {
		if s.storage != nil && entry.S3Key != "" {
			_ = s.storage.DeleteTheme(ctx, entry.S3Key)
		}
	}
	if err := s.repo.DeleteMarketplaceLibraryByPublishedIDs(ctx, publishedIDs); err != nil {
		return "", false, err
	}
	if err := s.repo.DeletePublishedByFamilyAndAuthor(ctx, userTheme.ThemeID, userID); err != nil {
		return "", false, err
	}
	for _, key := range publishedKeys {
		if s.storage != nil {
			_ = s.storage.DeleteTheme(ctx, key)
		}
	}
	return themeName, activeCleared, nil
}

// DeleteCreated removes the user's custom theme draft after it has been unpublished.
func (s *CustomThemeService) DeleteCreated(ctx context.Context, userID int64) error {
	if err := s.requirePro(ctx, userID); err != nil {
		return err
	}
	existing, err := s.repo.GetUserTheme(ctx, userID)
	if errors.Is(err, repository.ErrCustomThemeNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := s.ensureThemeUnpublished(ctx, existing.ThemeID, userID); err != nil {
		return err
	}
	return s.deleteUserDraft(ctx, userID, existing)
}

// PublishedVersionCount returns how many marketplace versions exist for the user's theme family.
func (s *CustomThemeService) PublishedVersionCount(ctx context.Context, userID int64, themeFamilyID uuid.UUID) (int, error) {
	if themeFamilyID == uuid.Nil {
		return 0, nil
	}
	return s.repo.CountPublishedByFamilyAndAuthor(ctx, themeFamilyID, userID)
}

func (s *CustomThemeService) ensureThemeUnpublished(ctx context.Context, themeFamilyID uuid.UUID, userID int64) error {
	n, err := s.repo.CountPublishedByFamilyAndAuthor(ctx, themeFamilyID, userID)
	if err != nil {
		return err
	}
	if n > 0 {
		return ErrCustomThemeStillPublished
	}
	return nil
}

func (s *CustomThemeService) deleteUserDraft(ctx context.Context, userID int64, existing *models.UserCustomTheme) error {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if u.ActiveCustomThemeLibraryID != nil {
		if entry, entryErr := s.repo.GetLibraryEntry(ctx, userID, *u.ActiveCustomThemeLibraryID); entryErr == nil && entry.Source == "own" {
			if err := s.users.UpdateActiveCustomThemeLibrary(ctx, userID, nil); err != nil {
				return err
			}
		}
	}
	if s.storage != nil && existing.S3Key != "" {
		_ = s.storage.DeleteTheme(ctx, existing.S3Key)
	}
	if err := s.repo.DeleteOwnLibraryEntry(ctx, userID); err != nil {
		return err
	}
	return s.repo.DeleteUserTheme(ctx, userID)
}

func (s *CustomThemeService) Publish(ctx context.Context, userID int64) (*models.PublishedCustomTheme, ValidationResult, error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return nil, ValidationResult{}, err
	}
	userTheme, err := s.repo.GetUserTheme(ctx, userID)
	if errors.Is(err, repository.ErrCustomThemeNotFound) {
		return nil, ValidationResult{}, ErrCustomThemeNotFound
	}
	if err != nil {
		return nil, ValidationResult{}, err
	}
	if s.storage == nil || !s.storage.Configured() {
		return nil, ValidationResult{}, ErrThemeStorageNotConfigured
	}
	raw, err := s.storage.GetTheme(ctx, userTheme.S3Key)
	if err != nil {
		return nil, ValidationResult{}, err
	}
	result := ParseAndValidateCustomThemeYAML(raw, s.googleFonts, s.iconify)
	if !result.Valid {
		return nil, result, nil
	}

	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, ValidationResult{}, err
	}
	profileURL := s.authorProfileURL(u.Username)
	displayName := strings.TrimSpace(u.DisplayName)
	if displayName == "" {
		displayName = strings.TrimSpace(u.Username)
	}
	if displayName == "" {
		displayName = "Kurator user"
	}

	themeFamilyID := userTheme.ThemeID
	version, err := s.repo.GetLatestPublishedVersion(ctx, themeFamilyID)
	if err != nil {
		return nil, ValidationResult{}, err
	}
	version++

	uid := userID
	author := models.CustomThemeAuthor{
		KuratorUserID: &uid,
		DisplayName:   &displayName,
		ProfileURL:    &profileURL,
	}
	yamlBytes, err := marshalPublishedThemeYAML(result.Theme, author)
	if err != nil {
		return nil, ValidationResult{}, err
	}

	pubID := uuid.New()
	key := PublishedThemeS3Key(themeFamilyID.String(), version)
	if err := s.storage.PutPublishedTheme(ctx, key, yamlBytes); err != nil {
		return nil, ValidationResult{}, err
	}
	row := &models.PublishedCustomTheme{
		ID:                pubID,
		ThemeFamilyID:     themeFamilyID,
		Version:           version,
		AuthorUserID:      &userID,
		AuthorDisplayName: displayName,
		AuthorProfileURL:  &profileURL,
		Name:              result.Theme.Meta.Name,
		Description:       result.Theme.Meta.Description,
		S3Key:             key,
		YAML:              string(yamlBytes),
	}
	if err := s.repo.InsertPublished(ctx, row); err != nil {
		return nil, ValidationResult{}, err
	}
	return row, result, nil
}

func marshalPublishedThemeYAML(theme *models.CustomThemePayload, author models.CustomThemeAuthor) ([]byte, error) {
	type publishedMeta struct {
		Name        string                   `yaml:"name"`
		Description string                   `yaml:"description"`
		Published   bool                     `yaml:"published"`
		Author      models.CustomThemeAuthor `yaml:"author"`
	}
	type publishedPayload struct {
		SchemaVersion string                       `yaml:"schemaVersion"`
		Meta          publishedMeta                `yaml:"meta"`
		Branding      models.CustomThemeBranding   `yaml:"branding"`
		Appearance    models.CustomThemeAppearance `yaml:"appearance"`
	}
	type publishedDoc struct {
		CustomTheme publishedPayload `yaml:"customTheme"`
	}
	doc := publishedDoc{
		CustomTheme: publishedPayload{
			SchemaVersion: theme.SchemaVersion,
			Meta: publishedMeta{
				Name:        theme.Meta.Name,
				Description: theme.Meta.Description,
				Published:   true,
				Author:      author,
			},
			Branding:   theme.Branding,
			Appearance: theme.Appearance,
		},
	}
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(doc); err != nil {
		return nil, err
	}
	if err := enc.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (s *CustomThemeService) ListPublished(ctx context.Context, query string, limit, offset int) ([]models.PublishedCustomTheme, int, error) {
	return s.repo.ListPublished(ctx, query, limit, offset)
}

func (s *CustomThemeService) GetPublished(ctx context.Context, id uuid.UUID) (*models.PublishedCustomTheme, error) {
	row, err := s.repo.GetPublishedByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if s.storage != nil && s.storage.Configured() {
		data, err := s.storage.GetTheme(ctx, row.S3Key)
		if err != nil {
			return nil, err
		}
		row.YAML = string(data)
	}
	return row, nil
}

func (s *CustomThemeService) ReportPublished(ctx context.Context, reporterUserID int64, publishedThemeID uuid.UUID, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return errors.New("reason is required")
	}
	if len(reason) > 500 {
		return errors.New("reason must be at most 500 characters")
	}
	if _, err := s.repo.GetPublishedByID(ctx, publishedThemeID); err != nil {
		return err
	}
	return s.repo.InsertReport(ctx, publishedThemeID, reporterUserID, reason)
}

func (s *CustomThemeService) AnonymizeAuthorOnPurge(ctx context.Context, userID int64) error {
	return s.repo.AnonymizePublishedAuthors(ctx, userID)
}

func (s *CustomThemeService) ListLibrary(ctx context.Context, userID int64) ([]models.CustomThemeLibraryEntry, *uuid.UUID, error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return nil, nil, err
	}
	if err := s.backfillOwnLibraryEntry(ctx, userID); err != nil {
		return nil, nil, err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	items, err := s.repo.ListLibrary(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	return items, u.ActiveCustomThemeLibraryID, nil
}

func (s *CustomThemeService) InstallMarketplace(ctx context.Context, userID int64, publishedThemeID uuid.UUID) (*models.CustomThemeLibraryEntry, error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return nil, err
	}
	if s.storage == nil || !s.storage.Configured() {
		return nil, ErrThemeStorageNotConfigured
	}
	pub, err := s.repo.GetPublishedByID(ctx, publishedThemeID)
	if err != nil {
		return nil, err
	}
	libraryID := uuid.New()
	key := LibraryThemeS3Key(userID, libraryID.String())
	if err := s.storage.CopyTheme(ctx, pub.S3Key, key); err != nil {
		return nil, err
	}
	row := &models.CustomThemeLibraryEntry{
		ID:          libraryID,
		UserID:      userID,
		Source:      "marketplace",
		RefID:       pub.ID,
		Name:        pub.Name,
		Description: pub.Description,
		S3Key:       key,
	}
	return s.repo.InsertLibraryEntry(ctx, row)
}

func (s *CustomThemeService) RemoveFromLibrary(ctx context.Context, userID int64, libraryID uuid.UUID) error {
	if err := s.requirePro(ctx, userID); err != nil {
		return err
	}
	entry, err := s.repo.GetLibraryEntry(ctx, userID, libraryID)
	if err != nil {
		return err
	}
	if entry.Source != "marketplace" {
		return ErrCannotRemoveOwnLibraryEntry
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if u.ActiveCustomThemeLibraryID != nil && *u.ActiveCustomThemeLibraryID == libraryID {
		if err := s.users.UpdateActiveCustomThemeLibrary(ctx, userID, nil); err != nil {
			return err
		}
	}
	if s.storage != nil && entry.S3Key != "" {
		_ = s.storage.DeleteTheme(ctx, entry.S3Key)
	}
	return s.repo.DeleteLibraryEntry(ctx, userID, libraryID)
}

func (s *CustomThemeService) SetActiveLibraryTheme(ctx context.Context, userID int64, libraryID *uuid.UUID) (*uuid.UUID, error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return nil, err
	}
	if libraryID == nil {
		if err := s.users.UpdateActiveCustomThemeLibrary(ctx, userID, nil); err != nil {
			return nil, err
		}
		return nil, nil
	}
	if _, err := s.repo.GetLibraryEntry(ctx, userID, *libraryID); err != nil {
		return nil, err
	}
	if err := s.users.UpdateActiveCustomThemeLibrary(ctx, userID, libraryID); err != nil {
		return nil, err
	}
	return libraryID, nil
}

func (s *CustomThemeService) GetActiveTheme(ctx context.Context, userID int64) (*models.CustomThemeLibraryEntry, error) {
	if err := s.requirePro(ctx, userID); err != nil {
		return nil, err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.ActiveCustomThemeLibraryID == nil {
		return nil, nil
	}
	entry, err := s.repo.GetLibraryEntry(ctx, userID, *u.ActiveCustomThemeLibraryID)
	if err != nil {
		return nil, err
	}
	if s.storage != nil && s.storage.Configured() && entry.S3Key != "" {
		data, err := s.storage.GetTheme(ctx, entry.S3Key)
		if err != nil {
			return nil, err
		}
		entry.YAML = string(data)
	}
	return entry, nil
}

func (s *CustomThemeService) syncOwnLibraryEntry(ctx context.Context, row *models.UserCustomTheme) error {
	_, err := s.repo.UpsertOwnLibraryEntry(ctx, &models.CustomThemeLibraryEntry{
		UserID:      row.UserID,
		RefID:       row.ThemeID,
		Name:        row.Name,
		Description: row.Description,
		S3Key:       row.S3Key,
	})
	return err
}

func (s *CustomThemeService) backfillOwnLibraryEntry(ctx context.Context, userID int64) error {
	items, err := s.repo.ListLibrary(ctx, userID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item.Source == "own" {
			return nil
		}
	}
	userTheme, err := s.repo.GetUserTheme(ctx, userID)
	if errors.Is(err, repository.ErrCustomThemeNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = s.repo.UpsertOwnLibraryEntry(ctx, &models.CustomThemeLibraryEntry{
		UserID:      userID,
		RefID:       userTheme.ThemeID,
		Name:        userTheme.Name,
		Description: userTheme.Description,
		S3Key:       userTheme.S3Key,
	})
	return err
}

func (s *CustomThemeService) requirePro(ctx context.Context, userID int64) error {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if !models.HasProPlan(u) {
		return ErrCustomThemeProRequired
	}
	return nil
}

func (s *CustomThemeService) checkRateLimit(ctx context.Context, userID int64) error {
	since := time.Now().Add(-24 * time.Hour)
	n, err := s.repo.CountUploadsSince(ctx, userID, since)
	if err != nil {
		return err
	}
	if n >= customThemeMaxUploadsPerDay {
		return ErrCustomThemeRateLimited
	}
	return nil
}

func (s *CustomThemeService) validateLogoReachable(ctx context.Context, rawURL string) error {
	data, mime, err := s.fetchLogo(ctx, rawURL)
	if err != nil {
		return err
	}
	_, _, ok := sniffImageType(data)
	if !ok && !strings.HasPrefix(mime, "image/") {
		return errors.New("logo URL must resolve to an image")
	}
	return nil
}

func (s *CustomThemeService) proxyLogo(ctx context.Context, rawURL string) (string, error) {
	if s.images != nil && s.images.Configured() {
		url, err := s.images.UploadFromURL(ctx, rawURL, "theme-logo")
		if err == nil {
			return url, nil
		}
	}
	if err := s.validateLogoReachable(ctx, rawURL); err != nil {
		return "", err
	}
	return rawURL, nil
}

func (s *CustomThemeService) fetchLogo(ctx context.Context, rawURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Kurator-ThemeLogo/1.0")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("could not fetch logo URL")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("logo fetch failed: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, defaultMaxImageBytes+1))
	if err != nil {
		return nil, "", err
	}
	mime := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if idx := strings.Index(mime, ";"); idx >= 0 {
		mime = strings.TrimSpace(mime[:idx])
	}
	return body, mime, nil
}

func (s *CustomThemeService) authorProfileURL(username string) string {
	username = strings.TrimSpace(username)
	if username == "" || s.publicWeb == "" {
		return ""
	}
	return fmt.Sprintf("%s/people/%s", s.publicWeb, username)
}
