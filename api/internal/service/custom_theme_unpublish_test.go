package service

import (
	"context"
	"testing"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type stubCustomThemeRepo struct {
	userTheme      *models.UserCustomTheme
	publishedCount int
}

func (s *stubCustomThemeRepo) GetUserTheme(_ context.Context, userID int64) (*models.UserCustomTheme, error) {
	if s.userTheme == nil || s.userTheme.UserID != userID {
		return nil, repository.ErrCustomThemeNotFound
	}
	return s.userTheme, nil
}
func (s *stubCustomThemeRepo) UpsertUserTheme(context.Context, *models.UserCustomTheme) error {
	return nil
}
func (s *stubCustomThemeRepo) DeleteUserTheme(context.Context, int64) error { return nil }
func (s *stubCustomThemeRepo) CountUploadsSince(context.Context, int64, time.Time) (int, error) {
	return 0, nil
}
func (s *stubCustomThemeRepo) RecordUpload(context.Context, int64) error { return nil }
func (s *stubCustomThemeRepo) ListPublished(context.Context, string, int, int) ([]models.PublishedCustomTheme, int, error) {
	return nil, 0, nil
}
func (s *stubCustomThemeRepo) GetPublishedByID(context.Context, uuid.UUID) (*models.PublishedCustomTheme, error) {
	return nil, repository.ErrPublishedThemeNotFound
}
func (s *stubCustomThemeRepo) GetLatestPublishedVersion(context.Context, uuid.UUID) (int, error) {
	return 0, nil
}
func (s *stubCustomThemeRepo) InsertPublished(context.Context, *models.PublishedCustomTheme) error {
	return nil
}
func (s *stubCustomThemeRepo) InsertReport(context.Context, uuid.UUID, int64, string) error { return nil }
func (s *stubCustomThemeRepo) AnonymizePublishedAuthors(context.Context, int64) error       { return nil }
func (s *stubCustomThemeRepo) UpsertOwnLibraryEntry(context.Context, *models.CustomThemeLibraryEntry) (*models.CustomThemeLibraryEntry, error) {
	return nil, nil
}
func (s *stubCustomThemeRepo) ListLibrary(context.Context, int64) ([]models.CustomThemeLibraryEntry, error) {
	return nil, nil
}
func (s *stubCustomThemeRepo) GetLibraryEntry(context.Context, int64, uuid.UUID) (*models.CustomThemeLibraryEntry, error) {
	return nil, repository.ErrThemeLibraryNotFound
}
func (s *stubCustomThemeRepo) InsertLibraryEntry(context.Context, *models.CustomThemeLibraryEntry) (*models.CustomThemeLibraryEntry, error) {
	return nil, nil
}
func (s *stubCustomThemeRepo) DeleteOwnLibraryEntry(context.Context, int64) error { return nil }
func (s *stubCustomThemeRepo) ListPublishedByFamilyAndAuthor(_ context.Context, themeFamilyID uuid.UUID, authorUserID int64) ([]models.PublishedCustomTheme, error) {
	if s.userTheme == nil || s.userTheme.ThemeID != themeFamilyID || s.userTheme.UserID != authorUserID {
		return nil, nil
	}
	if s.publishedCount == 0 {
		return nil, nil
	}
	return []models.PublishedCustomTheme{{ID: uuid.New(), ThemeFamilyID: themeFamilyID, Name: "Test Theme"}}, nil
}
func (s *stubCustomThemeRepo) CountPublishedByFamilyAndAuthor(_ context.Context, themeFamilyID uuid.UUID, authorUserID int64) (int, error) {
	if s.userTheme == nil || s.userTheme.ThemeID != themeFamilyID || s.userTheme.UserID != authorUserID {
		return 0, nil
	}
	return s.publishedCount, nil
}
func (s *stubCustomThemeRepo) DeletePublishedByFamilyAndAuthor(context.Context, uuid.UUID, int64) error {
	return nil
}
func (s *stubCustomThemeRepo) ListUsersWithActiveCustomThemeForUnpublish(context.Context, int64, uuid.UUID, []uuid.UUID) ([]int64, error) {
	return nil, nil
}
func (s *stubCustomThemeRepo) ListMarketplaceLibraryByPublishedIDs(context.Context, []uuid.UUID) ([]models.CustomThemeLibraryEntry, error) {
	return nil, nil
}
func (s *stubCustomThemeRepo) DeleteMarketplaceLibraryByPublishedIDs(context.Context, []uuid.UUID) error {
	return nil
}
func (s *stubCustomThemeRepo) DeleteLibraryEntry(context.Context, int64, uuid.UUID) error { return nil }

func TestEnsureThemeUnpublishedBlocksWhenPublished(t *testing.T) {
	familyID := uuid.New()
	svc := &CustomThemeService{
		repo: &stubCustomThemeRepo{
			userTheme:      &models.UserCustomTheme{UserID: 1, ThemeID: familyID},
			publishedCount: 1,
		},
	}
	err := svc.ensureThemeUnpublished(context.Background(), familyID, 1)
	if err != ErrCustomThemeStillPublished {
		t.Fatalf("expected ErrCustomThemeStillPublished, got %v", err)
	}
}

func TestEnsureThemeUnpublishedAllowsWhenNotPublished(t *testing.T) {
	familyID := uuid.New()
	svc := &CustomThemeService{
		repo: &stubCustomThemeRepo{
			userTheme:      &models.UserCustomTheme{UserID: 1, ThemeID: familyID},
			publishedCount: 0,
		},
	}
	if err := svc.ensureThemeUnpublished(context.Background(), familyID, 1); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestUnpublishRequiresPublishedTheme(t *testing.T) {
	familyID := uuid.New()
	svc := &CustomThemeService{
		repo: &stubCustomThemeRepo{
			userTheme:      &models.UserCustomTheme{UserID: 1, ThemeID: familyID},
			publishedCount: 0,
		},
		users: &proUserRepoStub{},
	}
	_, _, err := svc.Unpublish(context.Background(), 1)
	if err != ErrCustomThemeNotPublished {
		t.Fatalf("expected ErrCustomThemeNotPublished, got %v", err)
	}
}

type proUserRepoStub struct{}

func (proUserRepoStub) Create(context.Context, string, string, string, string) (*models.User, error) {
	return nil, nil
}
func (proUserRepoStub) CreateTx(context.Context, pgx.Tx, string, string, string, string) (*models.User, error) {
	return nil, nil
}
func (proUserRepoStub) CreateOAuth(context.Context, string, string, string, *string) (*models.User, error) {
	return nil, nil
}
func (proUserRepoStub) CreateOAuthTx(context.Context, pgx.Tx, string, string, string, *string) (*models.User, error) {
	return nil, nil
}
func (proUserRepoStub) GetByEmail(context.Context, string) (*models.User, error) { return nil, nil }
func (proUserRepoStub) GetByID(context.Context, int64) (*models.User, error) {
	return &models.User{ID: 1, Plan: models.PlanPro}, nil
}
func (proUserRepoStub) GetIDByUsernameCI(context.Context, string) (int64, error) { return 0, nil }
func (proUserRepoStub) UpdateProfile(context.Context, int64, string, string, *string, *string, string, string, string, bool, bool, []byte, string, bool, bool) error {
	return nil
}
func (proUserRepoStub) UpdateThemePreference(context.Context, int64, string) error { return nil }
func (proUserRepoStub) UpdateColorPreferences(context.Context, int64, string, bool) error {
	return nil
}
func (proUserRepoStub) UpdateFontPreferences(context.Context, int64, string, bool) error { return nil }
func (proUserRepoStub) SetTwoFactorPending(context.Context, int64, string) error         { return nil }
func (proUserRepoStub) EnableTwoFactor(context.Context, int64) error                     { return nil }
func (proUserRepoStub) DisableTwoFactor(context.Context, int64) error                    { return nil }
func (proUserRepoStub) UpdatePasswordHash(context.Context, int64, string) error          { return nil }
func (proUserRepoStub) UpdateStripeBilling(context.Context, int64, *string, *string, string, string, string) error {
	return nil
}
func (proUserRepoStub) UpdateActiveCustomThemeLibrary(context.Context, int64, *uuid.UUID) error {
	return nil
}
func (proUserRepoStub) GetUserIDByStripeCustomerID(context.Context, string) (int64, error) {
	return 0, nil
}
func (proUserRepoStub) GetUserIDBySubscriptionID(context.Context, string) (int64, error) {
	return 0, nil
}
