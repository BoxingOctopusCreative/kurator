package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestSessionRawFromRequest_cookiePreferred(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c *fiber.Ctx) error {
		if got := SessionRawFromRequest(c); got != "from-cookie" {
			t.Fatalf("cookie: got %q", got)
		}
		return nil
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer from-header")
	req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: "from-cookie"})
	_, _ = app.Test(req)
}

func TestSessionRawFromRequest_bearerWhenNoCookie(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c *fiber.Ctx) error {
		if got := SessionRawFromRequest(c); got != "abc123" {
			t.Fatalf("bearer: got %q", got)
		}
		return nil
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "bearer abc123")
	_, _ = app.Test(req)
}

func TestSessionRawFromRequest_empty(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c *fiber.Ctx) error {
		if got := SessionRawFromRequest(c); got != "" {
			t.Fatalf("empty: got %q", got)
		}
		return nil
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	_, _ = app.Test(req)
}

func TestSessionRawFromRequest_nonBearerIgnored(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c *fiber.Ctx) error {
		if got := SessionRawFromRequest(c); got != "" {
			t.Fatalf("non-bearer: got %q", got)
		}
		return nil
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Basic dGVzdA==")
	_, _ = app.Test(req)
}
