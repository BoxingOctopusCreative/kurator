package handler

import (
	"errors"
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/gofiber/fiber/v2"
)

type NotificationHandler struct {
	repo *repository.PostgresNotificationRepository
}

func NewNotificationHandler(repo *repository.PostgresNotificationRepository) *NotificationHandler {
	return &NotificationHandler{repo: repo}
}

type notificationsListResponse struct {
	Notifications []models.NotificationFeedItem `json:"notifications"`
	UnreadCount   int64                         `json:"unread_count"`
}

// List returns recent notifications for the signed-in user.
func (h *NotificationHandler) List(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "30"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	items, err := h.repo.ListForUser(c.Context(), uid, limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	unread, err := h.repo.UnreadCount(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(notificationsListResponse{Notifications: items, UnreadCount: unread})
}

func (h *NotificationHandler) MarkRead(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	idStr := c.Params("id")
	nid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || nid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.repo.MarkRead(c.Context(), nid, uid); err != nil {
		if errors.Is(err, repository.ErrNotificationNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *NotificationHandler) MarkAllRead(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	if err := h.repo.MarkAllRead(c.Context(), uid); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}
