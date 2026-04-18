package handler

import (
	"encoding/json"
	"errors"
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type WishlistHandler struct {
	svc *service.WishlistService
}

func NewWishlistHandler(svc *service.WishlistService) *WishlistHandler {
	return &WishlistHandler{svc: svc}
}

// List returns user's wishlists.
func (h *WishlistHandler) List(c *fiber.Ctx) error {
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

type createWishlistBody struct {
	Name               string `json:"name"`
	Description        string `json:"description"`
	TargetCollectionID *int64 `json:"target_collection_id"`
	IsPublic           *bool  `json:"is_public"`
}

func (h *WishlistHandler) Create(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body createWishlistBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	wl, err := h.svc.Create(c.Context(), uid, body.Name, body.Description, body.TargetCollectionID, body.IsPublic)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(wl)
}

type updateWishlistBody struct {
	Name               string `json:"name"`
	Description        string `json:"description"`
	TargetCollectionID *int64 `json:"target_collection_id"`
	IsPublic           *bool  `json:"is_public"`
}

func (h *WishlistHandler) Update(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body updateWishlistBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	wl, err := h.svc.Update(c.Context(), uid, id, body.Name, body.Description, body.TargetCollectionID, body.IsPublic)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(wl)
}

func (h *WishlistHandler) Delete(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.Delete(c.Context(), id, uid); err != nil {
		if errors.Is(err, repository.ErrWishlistNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *WishlistHandler) Get(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	wl, err := h.svc.Get(c.Context(), id, uid)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(wl)
}

func (h *WishlistHandler) ListEntries(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || wid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	entries, err := h.svc.ListEntries(c.Context(), wid, uid)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(entries)
}

type createWishlistEntryBody struct {
	Title    string          `json:"title"`
	Category models.Category `json:"category"`
	Metadata json.RawMessage `json:"metadata"`
}

func (h *WishlistHandler) CreateEntry(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || wid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	var body createWishlistEntryBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	entry, err := h.svc.AddEntry(c.Context(), wid, uid, body.Title, body.Category, body.Metadata)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(entry)
}

func (h *WishlistHandler) DeleteEntry(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || wid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	eid, err := strconv.ParseInt(c.Params("entryId"), 10, 64)
	if err != nil || eid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid entry id")
	}
	if err := h.svc.DeleteEntry(c.Context(), wid, eid, uid); err != nil {
		if errors.Is(err, repository.ErrWishlistNotFound) || errors.Is(err, repository.ErrWishlistEntryNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

type obtainBody struct {
	CollectionID *int64 `json:"collection_id"`
}

func (h *WishlistHandler) Obtain(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || wid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	eid, err := strconv.ParseInt(c.Params("entryId"), 10, 64)
	if err != nil || eid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid entry id")
	}
	var body obtainBody
	if err := c.BodyParser(&body); err != nil {
		// empty body ok
		body = obtainBody{}
	}
	item, err := h.svc.Obtain(c.Context(), uid, wid, eid, body.CollectionID)
	if errors.Is(err, repository.ErrWishlistNotFound) || errors.Is(err, repository.ErrWishlistEntryNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, repository.ErrCollectionNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "collection not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(item)
}
