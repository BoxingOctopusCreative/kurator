package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type onboardingHandlerUserRepo struct {
	user *models.User
}

func (r *onboardingHandlerUserRepo) Create(context.Context, string, string, string, string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (r *onboardingHandlerUserRepo) CreateTx(context.Context, pgx.Tx, string, string, string, string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (r *onboardingHandlerUserRepo) CreateOAuth(context.Context, string, string, string, *string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (r *onboardingHandlerUserRepo) CreateOAuthTx(context.Context, pgx.Tx, string, string, string, *string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (r *onboardingHandlerUserRepo) GetByEmail(context.Context, string) (*models.User, error) {
	return nil, repository.ErrUserNotFound
}
func (r *onboardingHandlerUserRepo) GetByID(context.Context, int64) (*models.User, error) {
	return r.user, nil
}
func (r *onboardingHandlerUserRepo) GetIDByUsernameCI(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (r *onboardingHandlerUserRepo) UpdateProfile(context.Context, int64, string, string, *string, *string, string, string, string, bool, bool, []byte, string, bool, bool) error {
	return nil
}
func (r *onboardingHandlerUserRepo) UpdateThemePreference(context.Context, int64, string) error { return nil }
func (r *onboardingHandlerUserRepo) UpdateColorPreferences(context.Context, int64, string, bool) error {
	return nil
}
func (r *onboardingHandlerUserRepo) UpdateFontPreferences(context.Context, int64, string, bool) error { return nil }
func (r *onboardingHandlerUserRepo) SetTwoFactorPending(context.Context, int64, string) error         { return nil }
func (r *onboardingHandlerUserRepo) EnableTwoFactor(context.Context, int64) error                     { return nil }
func (r *onboardingHandlerUserRepo) DisableTwoFactor(context.Context, int64) error                    { return nil }
func (r *onboardingHandlerUserRepo) UpdatePasswordHash(context.Context, int64, string) error          { return nil }
func (r *onboardingHandlerUserRepo) UpdateStripeBilling(context.Context, int64, *string, *string, string, string, string) error {
	return nil
}
func (r *onboardingHandlerUserRepo) UpdateActiveCustomThemeLibrary(context.Context, int64, *uuid.UUID) error {
	return nil
}
func (r *onboardingHandlerUserRepo) GetUserIDByStripeCustomerID(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (r *onboardingHandlerUserRepo) GetUserIDBySubscriptionID(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (r *onboardingHandlerUserRepo) UpdateOnboarding(context.Context, int64, int, bool) error { return nil }
func (r *onboardingHandlerUserRepo) UserHasAnyShelves(context.Context, int64) (bool, error)   { return false, nil }
func (r *onboardingHandlerUserRepo) SearchPublic(context.Context, string, int, *int64) ([]models.PublicUser, error) {
	return nil, nil
}

type onboardingHandlerProgressStub struct{}

func (onboardingHandlerProgressStub) LatestCollectionProgress(context.Context, int64) (*repository.OnboardingShelfProgress, error) {
	return nil, nil
}
func (onboardingHandlerProgressStub) LatestWishlistProgress(context.Context, int64) (*repository.OnboardingShelfProgress, error) {
	return nil, nil
}
func (onboardingHandlerProgressStub) HasCollectionWithMinItems(context.Context, int64, int64) (bool, error) {
	return false, nil
}
func (onboardingHandlerProgressStub) HasWishlistWithMinEntries(context.Context, int64, int64) (bool, error) {
	return false, nil
}

func TestOnboardingHandler_GetOnboarding(t *testing.T) {
	avatar := "https://cdn.example/a.jpg"
	users := &onboardingHandlerUserRepo{
		user: &models.User{
			ID:                  1,
			DisplayName:         "Ada",
			Bio:                 "Hi",
			AvatarURL:           &avatar,
			OnboardingStep:      1,
			OnboardingCompleted: false,
		},
	}
	svc := service.NewOnboardingService(users, onboardingHandlerProgressStub{})
	h := NewOnboardingHandler(svc)

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", int64(1))
		return c.Next()
	})
	app.Get("/onboarding", h.GetOnboarding)

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/onboarding", nil))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, body)
	}
	var out service.OnboardingStatus
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if out.OnboardingStep != 1 || out.OnboardingCompleted {
		t.Fatalf("unexpected status: %+v", out)
	}
}

func TestOnboardingHandler_PatchOnboarding_incompleteStep(t *testing.T) {
	users := &onboardingHandlerUserRepo{
		user: &models.User{ID: 1, OnboardingStep: 1},
	}
	svc := service.NewOnboardingService(users, onboardingHandlerProgressStub{})
	h := NewOnboardingHandler(svc)

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", int64(1))
		return c.Next()
	})
	app.Patch("/onboarding", h.PatchOnboarding)

	req := httptest.NewRequest(http.MethodPatch, "/onboarding", strings.NewReader(`{"onboarding_step":2}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusBadRequest {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, body)
	}
}
