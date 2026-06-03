package service

import (
	"context"
	"errors"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func TestNeedsOnboarding(t *testing.T) {
	u := &models.User{OnboardingCompleted: false, OnboardingStep: 1}
	if !NeedsOnboarding(u, false) {
		t.Fatal("expected onboarding for new user without shelves")
	}
	if NeedsOnboarding(u, true) {
		t.Fatal("existing shelves should skip onboarding")
	}
	u.OnboardingCompleted = true
	if NeedsOnboarding(u, false) {
		t.Fatal("completed onboarding should not show overlay")
	}
}

func TestEffectiveOnboardingStep(t *testing.T) {
	if effectiveOnboardingStep(&models.User{OnboardingStep: 0}) != 1 {
		t.Fatal("step 0 should map to 1")
	}
	if effectiveOnboardingStep(&models.User{OnboardingStep: 3}) != 3 {
		t.Fatal("expected step 3")
	}
	if effectiveOnboardingStep(&models.User{OnboardingStep: 9}) != 5 {
		t.Fatal("step above 5 should cap at 5")
	}
}

type onboardingUserStub struct {
	user              *models.User
	hasShelves        bool
	lastStep          int
	lastCompleted     bool
	updateCalls       int
}

func (s *onboardingUserStub) Create(context.Context, string, string, string, string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (s *onboardingUserStub) CreateTx(context.Context, pgx.Tx, string, string, string, string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (s *onboardingUserStub) CreateOAuth(context.Context, string, string, string, *string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (s *onboardingUserStub) CreateOAuthTx(context.Context, pgx.Tx, string, string, string, *string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (s *onboardingUserStub) GetByEmail(context.Context, string) (*models.User, error) {
	return nil, repository.ErrUserNotFound
}
func (s *onboardingUserStub) GetByID(context.Context, int64) (*models.User, error) {
	if s.user == nil {
		return nil, repository.ErrUserNotFound
	}
	return s.user, nil
}
func (s *onboardingUserStub) GetIDByUsernameCI(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (s *onboardingUserStub) UpdateProfile(context.Context, int64, string, string, *string, *string, string, string, string, bool, bool, []byte, string, bool, bool) error {
	return nil
}
func (s *onboardingUserStub) UpdateThemePreference(context.Context, int64, string) error { return nil }
func (s *onboardingUserStub) UpdateColorPreferences(context.Context, int64, string, bool) error {
	return nil
}
func (s *onboardingUserStub) UpdateFontPreferences(context.Context, int64, string, bool) error { return nil }
func (s *onboardingUserStub) SetTwoFactorPending(context.Context, int64, string) error         { return nil }
func (s *onboardingUserStub) EnableTwoFactor(context.Context, int64) error                     { return nil }
func (s *onboardingUserStub) DisableTwoFactor(context.Context, int64) error                    { return nil }
func (s *onboardingUserStub) UpdatePasswordHash(context.Context, int64, string) error          { return nil }
func (s *onboardingUserStub) UpdateStripeBilling(context.Context, int64, *string, *string, string, string, string) error {
	return nil
}
func (s *onboardingUserStub) UpdateActiveCustomThemeLibrary(context.Context, int64, *uuid.UUID) error {
	return nil
}
func (s *onboardingUserStub) GetUserIDByStripeCustomerID(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (s *onboardingUserStub) GetUserIDBySubscriptionID(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (s *onboardingUserStub) UpdateOnboarding(_ context.Context, _ int64, step int, completed bool) error {
	s.updateCalls++
	s.lastStep = step
	s.lastCompleted = completed
	if s.user != nil {
		s.user.OnboardingStep = step
		s.user.OnboardingCompleted = completed
	}
	return nil
}
func (s *onboardingUserStub) UserHasAnyShelves(context.Context, int64) (bool, error) {
	return s.hasShelves, nil
}

func (s *onboardingUserStub) SearchPublic(context.Context, string, int, *int64) ([]models.PublicUser, error) {
	return nil, nil
}

type onboardingProgressStub struct {
	hasCollection bool
	hasWishlist   bool
	colCount      int64
	wlCount       int64
}

func (s *onboardingProgressStub) LatestCollectionProgress(context.Context, int64) (*repository.OnboardingShelfProgress, error) {
	if !s.hasCollection {
		return nil, nil
	}
	return &repository.OnboardingShelfProgress{ShelfID: "col-1", ItemCount: s.colCount}, nil
}

func (s *onboardingProgressStub) LatestWishlistProgress(context.Context, int64) (*repository.OnboardingShelfProgress, error) {
	if !s.hasWishlist {
		return nil, nil
	}
	return &repository.OnboardingShelfProgress{ShelfID: "wl-1", ItemCount: s.wlCount}, nil
}

func (s *onboardingProgressStub) HasCollectionWithMinItems(context.Context, int64, int64) (bool, error) {
	return s.hasCollection && s.colCount >= onboardingMinShelfItems, nil
}

func (s *onboardingProgressStub) HasWishlistWithMinEntries(context.Context, int64, int64) (bool, error) {
	return s.hasWishlist && s.wlCount >= onboardingMinShelfItems, nil
}

func avatarURL(s string) *string { return &s }

func TestAdvanceStep_profileToMFA(t *testing.T) {
	users := &onboardingUserStub{
		user: &models.User{
			ID:              1,
			DisplayName:     "Ada",
			Bio:             "Collector",
			AvatarURL:       avatarURL("https://cdn.example/a.jpg"),
			OnboardingStep:  1,
			OnboardingCompleted: false,
		},
	}
	svc := NewOnboardingService(users, &onboardingProgressStub{})

	st, err := svc.AdvanceStep(context.Background(), 1, 2, false)
	if err != nil {
		t.Fatalf("AdvanceStep: %v", err)
	}
	if st.OnboardingStep != 2 {
		t.Fatalf("step: got %d want 2", st.OnboardingStep)
	}
	if users.lastStep != 2 || users.lastCompleted {
		t.Fatalf("UpdateOnboarding: step=%d completed=%v", users.lastStep, users.lastCompleted)
	}
}

func TestAdvanceStep_rejectsIncompleteProfile(t *testing.T) {
	users := &onboardingUserStub{
		user: &models.User{ID: 1, OnboardingStep: 1},
	}
	svc := NewOnboardingService(users, &onboardingProgressStub{})

	_, err := svc.AdvanceStep(context.Background(), 1, 2, false)
	if !errors.Is(err, ErrOnboardingStepIncomplete) {
		t.Fatalf("got %v want ErrOnboardingStepIncomplete", err)
	}
	if users.updateCalls != 0 {
		t.Fatal("expected no onboarding update")
	}
}

func TestAdvanceStep_completeOnStep5(t *testing.T) {
	users := &onboardingUserStub{
		user: &models.User{ID: 1, OnboardingStep: 5, OnboardingCompleted: false},
	}
	svc := NewOnboardingService(users, &onboardingProgressStub{})

	st, err := svc.AdvanceStep(context.Background(), 1, 5, true)
	if err != nil {
		t.Fatalf("AdvanceStep: %v", err)
	}
	if !st.OnboardingCompleted {
		t.Fatal("expected completed status")
	}
	if !users.lastCompleted || users.lastStep != 5 {
		t.Fatalf("UpdateOnboarding: step=%d completed=%v", users.lastStep, users.lastCompleted)
	}
}

func TestAdvanceStep_skipsWhenUserHasShelves(t *testing.T) {
	users := &onboardingUserStub{
		user:       &models.User{ID: 1, OnboardingStep: 2},
		hasShelves: true,
	}
	svc := NewOnboardingService(users, &onboardingProgressStub{})

	st, err := svc.AdvanceStep(context.Background(), 1, 3, false)
	if err != nil {
		t.Fatalf("AdvanceStep: %v", err)
	}
	if !st.OnboardingCompleted || st.OnboardingStep != 5 {
		t.Fatalf("got completed=%v step=%d", st.OnboardingCompleted, st.OnboardingStep)
	}
}

func TestGetStatus_includesShelfProgress(t *testing.T) {
	users := &onboardingUserStub{
		user: &models.User{ID: 1, OnboardingStep: 3},
	}
	progress := &onboardingProgressStub{
		hasCollection: true,
		colCount:      2,
		hasWishlist:   true,
		wlCount:       1,
	}
	svc := NewOnboardingService(users, progress)

	st, err := svc.GetStatus(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetStatus: %v", err)
	}
	if st.CollectionShelfID != "col-1" || st.CollectionItemCount != 2 {
		t.Fatalf("collection progress: %+v", st)
	}
	if st.WishlistShelfID != "wl-1" || st.WishlistEntryCount != 1 {
		t.Fatalf("wishlist progress: %+v", st)
	}
}
