package handler

import (
	"bytes"
	"encoding/json"
	"errors"

	"github.com/boxingoctopus/kurator/api/internal/httpx"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type ListHandler struct {
	svc *service.ListService
}

func NewListHandler(svc *service.ListService) *ListHandler {
	return &ListHandler{svc: svc}
}

func (h *ListHandler) List(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	items, err := h.svc.List(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(items)
}

type createListBody struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPublic    *bool  `json:"is_public"`
}

func (h *ListHandler) Create(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body createListBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	l, err := h.svc.Create(c.Context(), uid, body.Name, body.Description, body.IsPublic)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(l)
}

func (h *ListHandler) Get(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	l, err := h.svc.Get(c.Context(), id, uid)
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(l)
}

type updateListBody struct {
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	IsPublic     *bool   `json:"is_public"`
	CoverArtURL  *string `json:"cover_art_url"`
}

func (h *ListHandler) Update(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body updateListBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	l, err := h.svc.Update(c.Context(), uid, id, body.Name, body.Description, body.IsPublic, body.CoverArtURL)
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(l)
}

// DeleteListBody is optional JSON on DELETE /lists/:id.
type DeleteListBody struct {
	MoveEntriesTo  *string `json:"move_entries_to"`
	DiscardEntries bool    `json:"discard_entries"`
}

func (h *ListHandler) Delete(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body DeleteListBody
	raw := c.Body()
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid json")
		}
	}
	err = h.svc.Delete(c.Context(), uid, id, body.MoveEntriesTo, body.DiscardEntries)
	var conflict *service.ListDeleteConflict
	if errors.As(err, &conflict) && conflict != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":                 "list_has_entries",
			"entry_count":           conflict.EntryCount,
			"eligible_move_targets": conflict.EligibleMoveTargets,
		})
	}
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *ListHandler) ListItems(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	items, err := h.svc.ListItems(c.Context(), id, uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(items)
}

type addListItemBody struct {
	ItemID string `json:"item_id"`
}

func (h *ListHandler) AddItem(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	listID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body addListItemBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.svc.AddItem(c.Context(), uid, listID, body.ItemID); err != nil {
		if errors.Is(err, repository.ErrListDuplicateEntry) {
			return fiber.NewError(fiber.StatusConflict, err.Error())
		}
		if errors.Is(err, repository.ErrItemNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "item not found")
		}
		if errors.Is(err, service.ErrListAddForbidden) {
			return fiber.NewError(fiber.StatusForbidden, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *ListHandler) RemoveItem(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	listID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid list id")
	}
	itemID, err := httpx.PathUUID(c.Params("itemId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid item id")
	}
	if err := h.svc.RemoveItem(c.Context(), uid, listID, itemID); err != nil {
		if errors.Is(err, repository.ErrListEntryNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}
