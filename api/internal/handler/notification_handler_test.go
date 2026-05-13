package handler

import (
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/gofiber/fiber/v2"
)

type stubNotificationRepo struct {
	list        []models.NotificationFeedItem
	listErr     error
	unread      int64
	unreadErr   error
	markReadErr error
	markAllErr  error
}

func (s *stubNotificationRepo) ListForUser(ctx context.Context, userID int64, limit, offset int) ([]models.NotificationFeedItem, error) {
	_ = ctx
	_ = userID
	_ = limit
	_ = offset
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (s *stubNotificationRepo) UnreadCount(ctx context.Context, userID int64) (int64, error) {
	_ = ctx
	_ = userID
	if s.unreadErr != nil {
		return 0, s.unreadErr
	}
	return s.unread, nil
}

func (s *stubNotificationRepo) MarkRead(ctx context.Context, notificationID int64, userID int64) error {
	_ = ctx
	_ = notificationID
	_ = userID
	return s.markReadErr
}

func (s *stubNotificationRepo) MarkAllRead(ctx context.Context, userID int64) error {
	_ = ctx
	_ = userID
	return s.markAllErr
}

func newNotificationTestApp(t *testing.T, repo notificationRepository) *fiber.App {
	t.Helper()
	h := NewNotificationHandler(repo)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", int64(42))
		return c.Next()
	})
	app.Get("/me/notifications/unread-count", h.UnreadCount)
	app.Get("/me/notifications", h.List)
	return app
}

func TestNotificationHandler_UnreadCount_ok(t *testing.T) {
	app := newNotificationTestApp(t, &stubNotificationRepo{unread: 7})
	req := httptest.NewRequest("GET", "/me/notifications/unread-count", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `{"unread_count":7}` {
		t.Fatalf("body %s", body)
	}
}

func TestNotificationHandler_UnreadCount_unauthorized(t *testing.T) {
	h := NewNotificationHandler(&stubNotificationRepo{unread: 1})
	app := fiber.New()
	app.Get("/me/notifications/unread-count", h.UnreadCount)
	req := httptest.NewRequest("GET", "/me/notifications/unread-count", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("status %d want 401", resp.StatusCode)
	}
}

func TestNotificationHandler_UnreadCount_repoError(t *testing.T) {
	app := newNotificationTestApp(t, &stubNotificationRepo{unreadErr: errors.New("db down")})
	req := httptest.NewRequest("GET", "/me/notifications/unread-count", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 500 {
		t.Fatalf("status %d want 500", resp.StatusCode)
	}
}
