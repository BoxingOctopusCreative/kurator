package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type ShelfShareHandler struct {
	svc *service.ShelfShareService
}

func NewShelfShareHandler(svc *service.ShelfShareService) *ShelfShareHandler {
	return &ShelfShareHandler{svc: svc}
}

type shelfJoinBody struct {
	ShelfKind string `json:"shelf_kind"`
	ShelfID   string `json:"shelf_id"`
}

func (h *ShelfShareHandler) RequestJoin(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body shelfJoinBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	kind, err := repository.ParseShelfKind(strings.TrimSpace(body.ShelfKind))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid shelf_kind")
	}
	if err := h.svc.RequestJoin(c.Context(), uid, kind, body.ShelfID); err != nil {
		switch {
		case errors.Is(err, service.ErrShelfShareNotVisible):
			return fiber.NewError(fiber.StatusNotFound, "not found")
		case errors.Is(err, service.ErrShelfShareNotShared):
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrShelfShareIsOwner), errors.Is(err, service.ErrShelfShareAlreadyMember):
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		case errors.Is(err, repository.ErrShelfAccessPendingExists):
			return fiber.NewError(fiber.StatusConflict, err.Error())
		default:
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	return c.SendStatus(fiber.StatusNoContent)
}

type shelfInviteBody struct {
	ShelfKind     string  `json:"shelf_kind"`
	ShelfID       string  `json:"shelf_id"`
	InviteUserIDs []int64 `json:"invite_user_ids"`
}

func (h *ShelfShareHandler) Invite(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body shelfInviteBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	kind, err := repository.ParseShelfKind(strings.TrimSpace(body.ShelfKind))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid shelf_kind")
	}
	if err := h.svc.InviteToShelf(c.Context(), uid, kind, body.ShelfID, body.InviteUserIDs); err != nil {
		switch {
		case errors.Is(err, service.ErrShelfShareNotVisible):
			return fiber.NewError(fiber.StatusNotFound, "not found")
		case errors.Is(err, service.ErrShelfShareNotShared):
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrShelfShareNoSelf), errors.Is(err, service.ErrShelfShareNotMutualFriend):
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		default:
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *ShelfShareHandler) ApproveRequest(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	idStr := c.Params("id")
	rid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || rid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.ApproveRequest(c.Context(), uid, rid); err != nil {
		if errors.Is(err, repository.ErrShelfAccessRequestNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		if errors.Is(err, repository.ErrShelfAccessNotPending) {
			return fiber.NewError(fiber.StatusConflict, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *ShelfShareHandler) DismissRequest(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	idStr := c.Params("id")
	rid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || rid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.DismissRequest(c.Context(), uid, rid); err != nil {
		if errors.Is(err, repository.ErrShelfAccessRequestNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		if errors.Is(err, repository.ErrShelfAccessNotPending) {
			return fiber.NewError(fiber.StatusConflict, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}
