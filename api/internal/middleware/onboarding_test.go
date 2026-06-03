package middleware

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type onboardingMiddlewareUserRepo struct {
	user       *models.User
	hasShelves bool
}

func (r *onboardingMiddlewareUserRepo) Create(context.Context, string, string, string, string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (r *onboardingMiddlewareUserRepo) CreateTx(context.Context, pgx.Tx, string, string, string, string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (r *onboardingMiddlewareUserRepo) CreateOAuth(context.Context, string, string, string, *string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (r *onboardingMiddlewareUserRepo) CreateOAuthTx(context.Context, pgx.Tx, string, string, string, *string) (*models.User, error) {
	return nil, errors.New("not implemented")
}
func (r *onboardingMiddlewareUserRepo) GetByEmail(context.Context, string) (*models.User, error) {
	return nil, repository.ErrUserNotFound
}
func (r *onboardingMiddlewareUserRepo) GetByID(context.Context, int64) (*models.User, error) {
	if r.user == nil {
		return nil, repository.ErrUserNotFound
	}
	return r.user, nil
}
func (r *onboardingMiddlewareUserRepo) GetIDByUsernameCI(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (r *onboardingMiddlewareUserRepo) UpdateProfile(context.Context, int64, string, string, *string, *string, string, string, string, bool, bool, []byte, string, bool, bool) error {
	return nil
}
func (r *onboardingMiddlewareUserRepo) UpdateThemePreference(context.Context, int64, string) error { return nil }
func (r *onboardingMiddlewareUserRepo) UpdateColorPreferences(context.Context, int64, string, bool) error {
	return nil
}
func (r *onboardingMiddlewareUserRepo) UpdateFontPreferences(context.Context, int64, string, bool) error {
	return nil
}
func (r *onboardingMiddlewareUserRepo) SetTwoFactorPending(context.Context, int64, string) error { return nil }
func (r *onboardingMiddlewareUserRepo) EnableTwoFactor(context.Context, int64) error             { return nil }
func (r *onboardingMiddlewareUserRepo) DisableTwoFactor(context.Context, int64) error            { return nil }
func (r *onboardingMiddlewareUserRepo) UpdatePasswordHash(context.Context, int64, string) error  { return nil }
func (r *onboardingMiddlewareUserRepo) UpdateStripeBilling(context.Context, int64, *string, *string, string, string, string) error {
	return nil
}
func (r *onboardingMiddlewareUserRepo) UpdateActiveCustomThemeLibrary(context.Context, int64, *uuid.UUID) error {
	return nil
}
func (r *onboardingMiddlewareUserRepo) GetUserIDByStripeCustomerID(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (r *onboardingMiddlewareUserRepo) GetUserIDBySubscriptionID(context.Context, string) (int64, error) {
	return 0, repository.ErrUserNotFound
}
func (r *onboardingMiddlewareUserRepo) UpdateOnboarding(context.Context, int64, int, bool) error { return nil }
func (r *onboardingMiddlewareUserRepo) UserHasAnyShelves(context.Context, int64) (bool, error) {
	return r.hasShelves, nil
}
func (r *onboardingMiddlewareUserRepo) SearchPublic(context.Context, string, int, *int64) ([]models.PublicUser, error) {
	return nil, nil
}

func TestRequireOnboardingComplete_blocksIncomplete(t *testing.T) {
	repo := &onboardingMiddlewareUserRepo{
		user: &models.User{ID: 1, OnboardingCompleted: false},
	}
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", int64(1))
		return c.Next()
	})
	app.Get("/", RequireOnboardingComplete(repo), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusForbidden {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status=%d body=%s", resp.StatusCode, body)
	}
}

func TestRequireOnboardingComplete_allowsCompleted(t *testing.T) {
	repo := &onboardingMiddlewareUserRepo{
		user: &models.User{ID: 1, OnboardingCompleted: true},
	}
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", int64(1))
		return c.Next()
	})
	app.Get("/", RequireOnboardingComplete(repo), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("status=%d", resp.StatusCode)
	}
}

func TestRequireOnboardingComplete_allowsLegacyShelves(t *testing.T) {
	repo := &onboardingMiddlewareUserRepo{
		user:       &models.User{ID: 1, OnboardingCompleted: false},
		hasShelves: true,
	}
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", int64(1))
		return c.Next()
	})
	app.Get("/", RequireOnboardingComplete(repo), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("status=%d", resp.StatusCode)
	}
}
