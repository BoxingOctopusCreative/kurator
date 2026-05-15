package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// SessionRawFromRequest returns the raw opaque session string used by UserIDFromSession.
// It prefers the kurator_session cookie (browser / same-origin clients), then Authorization: Bearer <token>
// (native and other non-cookie clients). The value is identical to the cookie body when both are set.
func SessionRawFromRequest(c *fiber.Ctx) string {
	if v := c.Cookies(SessionCookieName); v != "" {
		return v
	}
	return sessionTokenFromAuthorization(c.Get("Authorization"))
}

func sessionTokenFromAuthorization(h string) string {
	h = strings.TrimSpace(h)
	if h == "" {
		return ""
	}
	scheme, value, ok := strings.Cut(h, " ")
	if !ok {
		return ""
	}
	if !strings.EqualFold(strings.TrimSpace(scheme), "Bearer") {
		return ""
	}
	return strings.TrimSpace(value)
}
