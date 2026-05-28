package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/httpx"
	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type ListHandler struct {
	svc    *service.ListService
	auth   *service.AuthService
	fanout *service.ActivityFanout
	share  *service.ShelfShareService
}

func NewListHandler(svc *service.ListService, auth *service.AuthService, fanout *service.ActivityFanout, share *service.ShelfShareService) *ListHandler {
	return &ListHandler{svc: svc, auth: auth, fanout: fanout, share: share}
}

func (h *ListHandler) List(c *fiber.Ctx) error {
	var viewer *int64
	raw := middleware.SessionRawFromRequest(c)
	if raw != "" && h.auth != nil {
		uid, err := h.auth.UserIDFromSession(c.Context(), raw)
		if err == nil {
			viewer = &uid
		}
	}
	if ou := c.Query("owner_user_id"); ou != "" {
		n, err := strconv.ParseInt(ou, 10, 64)
		if err != nil || n < 1 {
			return fiber.NewError(fiber.StatusBadRequest, "invalid owner_user_id")
		}
		items, err := h.svc.ListByOwnerForViewer(c.Context(), n, viewer)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(items)
	}
	if viewer == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	items, err := h.svc.List(c.Context(), *viewer)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(items)
}

type createListBody struct {
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	Visibility    *string `json:"visibility"`
	IsPublic      *bool   `json:"is_public"`
	IsShared      bool    `json:"is_shared"`
	InviteUserIDs []int64 `json:"invite_user_ids"`
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
	vis, verr := resolveVisibility(body.Visibility, body.IsPublic)
	if verr != nil {
		return verr
	}
	if len(body.InviteUserIDs) > 0 && !body.IsShared {
		return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires is_shared")
	}
	l, err := h.svc.Create(c.Context(), uid, body.Name, body.Description, vis, body.IsShared, nil, nil, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if h.share != nil && body.IsShared && len(body.InviteUserIDs) > 0 {
		if err := h.share.InviteToShelf(c.Context(), uid, repository.ShelfKindList, l.ID, body.InviteUserIDs); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	if h.fanout != nil {
		h.fanout.NotifyListCreated(c.Context(), uid, l.Visibility, l.ID, l.Name, nil)
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
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	Visibility    *string `json:"visibility"`
	IsPublic      *bool   `json:"is_public"`
	CoverArtURL   *string `json:"cover_art_url"`
	IsShared      *bool   `json:"is_shared"`
	InviteUserIDs []int64 `json:"invite_user_ids"`
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
	vis, verr := resolveVisibility(body.Visibility, body.IsPublic)
	if verr != nil {
		return verr
	}
	if len(body.InviteUserIDs) > 0 && body.IsShared != nil && !*body.IsShared {
		return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires is_shared")
	}
	l, err := h.svc.Update(c.Context(), uid, id, body.Name, body.Description, vis, body.CoverArtURL, body.IsShared, nil)
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if len(body.InviteUserIDs) > 0 {
		if !l.IsShared {
			return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires a shared list; set is_shared true")
		}
		if h.share != nil {
			if err := h.share.InviteToShelf(c.Context(), uid, repository.ShelfKindList, l.ID, body.InviteUserIDs); err != nil {
				return fiber.NewError(fiber.StatusBadRequest, err.Error())
			}
		}
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

// ExportItemsCSV returns all items on the list as CSV (owner only).
func (h *ListHandler) ExportItemsCSV(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	parsedID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	id := parsedID.String()
	l, err := h.svc.Get(c.Context(), id, uid)
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if l.UserID != uid {
		return fiber.NewError(fiber.StatusForbidden, "only the list owner can export items")
	}
	b, err := h.svc.ExportListItemsCSV(c.Context(), id, uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="list-items.csv"`)
	return c.Send(b)
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
