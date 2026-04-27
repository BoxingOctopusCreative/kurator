package middleware

import (
	"errors"

	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

// SessionCookieName is the HTTP cookie name for the session token.
const SessionCookieName = "kurator_session"

// BetaUnlockCookieName stores a signed JWT after POST /auth/beta/unlock (HTTP-only).
const BetaUnlockCookieName = "kurator_beta_unlock"

// RequireAuth loads the session cookie and sets c.Locals("userID", int64).
func RequireAuth(auth *service.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := c.Cookies(SessionCookieName)
		uid, err := auth.UserIDFromSession(c.Context(), raw)
		if err != nil {
			if errors.Is(err, repository.ErrSessionInvalid) {
				return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
			}
			return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
		}
		c.Locals("userID", uid)
		return c.Next()
	}
}
