package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type SocialHandler struct {
	svc  *service.SocialService
	auth *service.AuthService
}

func NewSocialHandler(svc *service.SocialService, auth *service.AuthService) *SocialHandler {
	return &SocialHandler{svc: svc, auth: auth}
}

func viewerID(c *fiber.Ctx, auth *service.AuthService) *int64 {
	raw := c.Cookies(middleware.SessionCookieName)
	if raw == "" {
		return nil
	}
	uid, err := auth.UserIDFromSession(c.Context(), raw)
	if err != nil {
		return nil
	}
	return &uid
}

func (h *SocialHandler) resolveTargetID(c *fiber.Ctx) (int64, error) {
	ref := strings.TrimSpace(c.Params("userRef"))
	if ref == "" {
		return 0, fiber.NewError(fiber.StatusBadRequest, "invalid user")
	}
	id, err := h.svc.ResolveUserRef(c.Context(), ref)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return 0, fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return 0, fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return id, nil
}

// SearchUsers finds accounts by username, display name, or bio (requires login).
// @Summary Search users
// @Tags social
// @Produce json
// @Param q query string true "Search text"
// @Success 200 {array} models.PublicUser
// @Router /api/v1/users/search [get]
func (h *SocialHandler) SearchUsers(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	q := c.Query("q")
	users, err := h.svc.SearchUsers(c.Context(), q, &uid)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(users)
}

// GetUser returns a public profile and follow stats (userRef is username or legacy numeric id).
func (h *SocialHandler) GetUser(c *fiber.Ctx) error {
	id, err := h.resolveTargetID(c)
	if err != nil {
		return err
	}
	v := viewerID(c, h.auth)
	p, err := h.svc.GetProfile(c.Context(), id, v)
	if errors.Is(err, repository.ErrUserNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(p)
}

type userListResult struct {
	Items    interface{} `json:"items"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"page_size"`
}

func (h *SocialHandler) ListFollowers(c *fiber.Ctx) error {
	id, err := h.resolveTargetID(c)
	if err != nil {
		return err
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "24"))
	items, total, err := h.svc.ListFollowers(c.Context(), id, viewerID(c, h.auth), page, limit)
	if errors.Is(err, repository.ErrUserNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(userListResult{Items: items, Total: total, Page: page, PageSize: limit})
}

func (h *SocialHandler) ListFollowing(c *fiber.Ctx) error {
	id, err := h.resolveTargetID(c)
	if err != nil {
		return err
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "24"))
	items, total, err := h.svc.ListFollowing(c.Context(), id, viewerID(c, h.auth), page, limit)
	if errors.Is(err, repository.ErrUserNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(userListResult{Items: items, Total: total, Page: page, PageSize: limit})
}

func (h *SocialHandler) ListMyFriends(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "24"))
	items, total, err := h.svc.ListMyFriends(c.Context(), uid, page, limit)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(userListResult{Items: items, Total: total, Page: page, PageSize: limit})
}

func (h *SocialHandler) ListPeopleYouMayKnow(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "24"))
	items, total, err := h.svc.ListPeopleYouMayKnow(c.Context(), uid, page, limit)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(userListResult{Items: items, Total: total, Page: page, PageSize: limit})
}

func (h *SocialHandler) Follow(c *fiber.Ctx) error {
	followerID, ok := c.Locals("userID").(int64)
	if !ok || followerID < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	targetID, err := h.resolveTargetID(c)
	if err != nil {
		return err
	}
	err = h.svc.Follow(c.Context(), followerID, targetID)
	if errors.Is(err, repository.ErrCannotFollowSelf) {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if errors.Is(err, repository.ErrUserNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *SocialHandler) Unfollow(c *fiber.Ctx) error {
	followerID, ok := c.Locals("userID").(int64)
	if !ok || followerID < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	targetID, err := h.resolveTargetID(c)
	if err != nil {
		return err
	}
	if err := h.svc.Unfollow(c.Context(), followerID, targetID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}
