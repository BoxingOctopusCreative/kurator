package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/httpx"
	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type WishlistHandler struct {
	svc    *service.WishlistService
	auth   *service.AuthService
	fanout *service.ActivityFanout
	share  *service.ShelfShareService
}

func NewWishlistHandler(svc *service.WishlistService, auth *service.AuthService, fanout *service.ActivityFanout, share *service.ShelfShareService) *WishlistHandler {
	return &WishlistHandler{svc: svc, auth: auth, fanout: fanout, share: share}
}

func (h *WishlistHandler) applyMayEditEntries(ctx context.Context, viewerID int64, wl *models.Wishlist) {
	if wl == nil {
		return
	}
	ok, err := h.svc.UserMayMutateWishlistContent(ctx, wl.ID, viewerID)
	if err == nil {
		wl.MayEditEntries = ok
	}
}

func (h *WishlistHandler) applyMayEditEntriesList(ctx context.Context, viewerID int64, list []models.Wishlist) {
	for i := range list {
		h.applyMayEditEntries(ctx, viewerID, &list[i])
	}
}

// List returns the signed-in user's wishlists, or when owner_user_id is set, that owner's wishlists visible to the viewer (optional session cookie).
func (h *WishlistHandler) List(c *fiber.Ctx) error {
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

type createWishlistBody struct {
	Name               string  `json:"name"`
	Description        string  `json:"description"`
	TargetCollectionID *string `json:"target_collection_id"`
	Visibility         *string `json:"visibility"`
	IsPublic           *bool   `json:"is_public"`
	IsShared           bool    `json:"is_shared"`
	InviteUserIDs      []int64 `json:"invite_user_ids"`
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
	vis, verr := resolveVisibility(body.Visibility, body.IsPublic)
	if verr != nil {
		return verr
	}
	if len(body.InviteUserIDs) > 0 && !body.IsShared {
		return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires is_shared")
	}
	wl, err := h.svc.Create(c.Context(), uid, body.Name, body.Description, body.TargetCollectionID, vis, body.IsShared)
	if errors.Is(err, service.ErrForbiddenCollectionTarget) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if h.share != nil && body.IsShared && len(body.InviteUserIDs) > 0 {
		if err := h.share.InviteToShelf(c.Context(), uid, repository.ShelfKindWishlist, wl.ID, body.InviteUserIDs); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	if h.fanout != nil {
		h.fanout.NotifyWishlistCreated(c.Context(), uid, wl.Visibility, wl.ID, wl.Name)
	}
	h.applyMayEditEntries(c.Context(), uid, wl)
	return c.Status(fiber.StatusCreated).JSON(wl)
}

type updateWishlistBody struct {
	Name               string  `json:"name"`
	Description        string  `json:"description"`
	TargetCollectionID *string `json:"target_collection_id"`
	Visibility         *string `json:"visibility"`
	IsPublic           *bool   `json:"is_public"`
	CoverArtURL        *string `json:"cover_art_url"`
	IsShared           *bool   `json:"is_shared"`
	InviteUserIDs      []int64 `json:"invite_user_ids"`
}

func (h *WishlistHandler) Update(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body updateWishlistBody
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
	wl, err := h.svc.Update(c.Context(), uid, id, body.Name, body.Description, body.TargetCollectionID, vis, body.CoverArtURL, body.IsShared)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, service.ErrForbiddenCollectionTarget) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if len(body.InviteUserIDs) > 0 {
		if !wl.IsShared {
			return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires a shared wishlist; set is_shared true")
		}
		if h.share != nil {
			if err := h.share.InviteToShelf(c.Context(), uid, repository.ShelfKindWishlist, wl.ID, body.InviteUserIDs); err != nil {
				return fiber.NewError(fiber.StatusBadRequest, err.Error())
			}
		}
	}
	h.applyMayEditEntries(c.Context(), uid, wl)
	return c.JSON(wl)
}

// DeleteWishlistBody is optional JSON on DELETE /wishlists/:id.
type DeleteWishlistBody struct {
	MoveEntriesTo  *string `json:"move_entries_to"`
	DiscardEntries bool    `json:"discard_entries"`
}

func (h *WishlistHandler) Delete(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body DeleteWishlistBody
	raw := c.Body()
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid json")
		}
	}
	err = h.svc.Delete(c.Context(), id, uid, body.MoveEntriesTo, body.DiscardEntries)
	var conflict *service.WishlistDeleteConflict
	if errors.As(err, &conflict) && conflict != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":                 "wishlist_has_entries",
			"entry_count":           conflict.EntryCount,
			"eligible_move_targets": conflict.EligibleMoveTargets,
		})
	}
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ExportEntriesCSV returns wishlist entries as CSV (owner only).
func (h *WishlistHandler) ExportEntriesCSV(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	wl, err := h.svc.Get(c.Context(), wid, uid)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if wl.UserID != uid {
		return fiber.NewError(fiber.StatusForbidden, "only the wishlist owner can export entries")
	}
	b, err := h.svc.ExportWishlistEntriesCSV(c.Context(), wid, uid)
	if err != nil {
		if errors.Is(err, repository.ErrWishlistNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="wishlist-%s-entries.csv"`, wid))
	return c.Send(b)
}

// ImportEntriesCSV accepts multipart form field "file" (CSV). Creates rows; non-empty id updates that entry on this wishlist.
func (h *WishlistHandler) ImportEntriesCSV(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	wl, err := h.svc.Get(c.Context(), wid, uid)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if wl.UserID != uid {
		return fiber.NewError(fiber.StatusForbidden, "only the wishlist owner can import entries")
	}
	file, err := c.FormFile("file")
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, `multipart form field "file" with CSV is required`)
	}
	fh, err := file.Open()
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "could not read upload")
	}
	defer fh.Close()

	res, err := h.svc.ImportWishlistEntriesFromCSV(c.Context(), wid, uid, fh)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(res)
}

func (h *WishlistHandler) Get(c *fiber.Ctx) error {
	var viewer *int64
	raw := middleware.SessionRawFromRequest(c)
	if raw != "" && h.auth != nil {
		uid, err := h.auth.UserIDFromSession(c.Context(), raw)
		if err == nil {
			viewer = &uid
		}
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	wl, err := h.svc.GetVisible(c.Context(), id, viewer)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if viewer != nil {
		h.applyMayEditEntries(c.Context(), *viewer, wl)
	}
	return c.JSON(wl)
}

func (h *WishlistHandler) ListEntries(c *fiber.Ctx) error {
	var viewer *int64
	raw := middleware.SessionRawFromRequest(c)
	if raw != "" && h.auth != nil {
		uid, err := h.auth.UserIDFromSession(c.Context(), raw)
		if err == nil {
			viewer = &uid
		}
	}
	wid, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	entries, err := h.svc.ListEntriesVisible(c.Context(), wid, viewer)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(entries)
}

type wishlistEntryBody struct {
	Title       string          `json:"title"`
	Category    models.Category `json:"category"`
	Metadata    json.RawMessage `json:"metadata"`
	PurchaseURL *string         `json:"purchase_url"`
}

func (h *WishlistHandler) CreateEntry(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	var body wishlistEntryBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	entry, err := h.svc.AddEntry(c.Context(), wid, uid, body.Title, body.Category, body.Metadata, body.PurchaseURL)
	if errors.Is(err, repository.ErrWishlistNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(entry)
}

func (h *WishlistHandler) UpdateEntry(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	eid, err := httpx.PathUUID(c.Params("entryId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid entry id")
	}
	var body wishlistEntryBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	entry, err := h.svc.UpdateEntry(c.Context(), wid, eid, uid, body.Title, body.Category, body.Metadata, body.PurchaseURL)
	if errors.Is(err, repository.ErrWishlistNotFound) || errors.Is(err, repository.ErrWishlistEntryNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(entry)
}

type patchWishlistEntryPurchaseURLBody struct {
	PurchaseURL *string `json:"purchase_url"`
}

// PatchEntryPurchaseURL updates only purchase_url (for existing entries without resubmitting metadata).
func (h *WishlistHandler) PatchEntryPurchaseURL(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	eid, err := httpx.PathUUID(c.Params("entryId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid entry id")
	}
	var body patchWishlistEntryPurchaseURLBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	entry, err := h.svc.PatchEntryPurchaseURL(c.Context(), wid, eid, uid, body.PurchaseURL)
	if errors.Is(err, repository.ErrWishlistNotFound) || errors.Is(err, repository.ErrWishlistEntryNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(entry)
}

func (h *WishlistHandler) DeleteEntry(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	eid, err := httpx.PathUUID(c.Params("entryId"))
	if err != nil {
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
	CollectionID *string `json:"collection_id"`
}

func (h *WishlistHandler) Obtain(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	wid, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid wishlist id")
	}
	eid, err := httpx.PathUUID(c.Params("entryId"))
	if err != nil {
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
	if errors.Is(err, service.ErrForbiddenCollectionTarget) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(item)
}
