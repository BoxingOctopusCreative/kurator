package middleware

import (
	"errors"

	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/gofiber/fiber/v2"
)

// RequireOnboardingComplete blocks social endpoints until the user finishes onboarding.
func RequireOnboardingComplete(users repository.UserRepository) fiber.Handler {
	return func(c *fiber.Ctx) error {
		v := c.Locals("userID")
		uid, ok := v.(int64)
		if !ok || uid < 1 {
			return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
		}
		u, err := users.GetByID(c.Context(), uid)
		if err != nil {
			if errors.Is(err, repository.ErrUserNotFound) {
				return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
			}
			return fiber.NewError(fiber.StatusInternalServerError, "could not load user")
		}
		if u.OnboardingCompleted {
			return c.Next()
		}
		hasShelves, err := users.UserHasAnyShelves(c.Context(), uid)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "could not load user")
		}
		if hasShelves {
			return c.Next()
		}
		return fiber.NewError(fiber.StatusForbidden, "complete onboarding to use social features")
	}
}
