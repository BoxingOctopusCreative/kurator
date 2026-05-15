package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/httpx"
	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type ItemHandler struct {
	svc    *service.ItemService
	coll   *repository.PostgresCollectionRepository
	auth   *service.AuthService
	meta   *service.MetadataService
	list   *service.ListService
	fanout *service.ActivityFanout
}

func NewItemHandler(
	svc *service.ItemService,
	coll *repository.PostgresCollectionRepository,
	auth *service.AuthService,
	meta *service.MetadataService,
	list *service.ListService,
	fanout *service.ActivityFanout,
) *ItemHandler {
	return &ItemHandler{svc: svc, coll: coll, auth: auth, meta: meta, list: list, fanout: fanout}
}

func (h *ItemHandler) requireUserID(c *fiber.Ctx) (int64, error) {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return 0, fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	return uid, nil
}

// assertMayMutateCollection returns 403 when the viewer may not change content in this collection,
// 404 when the collection is missing or not visible to the viewer.
func (h *ItemHandler) assertMayMutateCollection(c *fiber.Ctx, userID int64, collectionID string) error {
	if h.coll == nil {
		return nil
	}
	ok, err := h.coll.UserMayMutateCollectionContent(c.Context(), collectionID, userID)
	if err != nil {
		if errors.Is(err, repository.ErrCollectionNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "collection not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if !ok {
		return fiber.NewError(fiber.StatusForbidden, "forbidden")
	}
	return nil
}

// List returns recent items, or items for collection_id when set. Optional session cookie can unlock private collections.
func (h *ItemHandler) List(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "24"))
	var (
		items []models.Item
		err   error
	)
	if cid := c.Query("collection_id"); cid != "" {
		id, perr := httpx.PathUUID(cid)
		if perr != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid collection_id")
		}
		var viewer *int64
		raw := middleware.SessionRawFromRequest(c)
		if raw != "" {
			uid, aerr := h.auth.UserIDFromSession(c.Context(), raw)
			if aerr == nil {
				viewer = &uid
			}
		}
		if h.coll != nil {
			_, cerr := h.coll.GetByID(c.Context(), id, viewer)
			if errors.Is(cerr, repository.ErrCollectionNotFound) {
				return fiber.NewError(fiber.StatusNotFound, "collection not found")
			}
			if cerr != nil {
				return fiber.NewError(fiber.StatusInternalServerError, cerr.Error())
			}
		}
		cf, ferr := validation.ItemListConsumptionFilter(c.Query("consumption_status"))
		if ferr != nil {
			return fiber.NewError(fiber.StatusBadRequest, ferr.Error())
		}
		items, err = h.svc.ListByCollection(c.Context(), id, viewer, limit, cf)
	} else {
		scope := strings.TrimSpace(strings.ToLower(c.Query("scope")))
		switch scope {
		case "mine", "following":
			raw := middleware.SessionRawFromRequest(c)
			if raw == "" {
				return fiber.NewError(fiber.StatusUnauthorized, "sign in to use scope="+scope)
			}
			uid, aerr := h.auth.UserIDFromSession(c.Context(), raw)
			if aerr != nil {
				return fiber.NewError(fiber.StatusUnauthorized, "sign in to use scope="+scope)
			}
			if scope == "mine" {
				items, err = h.svc.ListRecentForOwner(c.Context(), uid, limit)
			} else {
				items, err = h.svc.ListRecentFromFollowedUsers(c.Context(), uid, limit)
			}
		case "":
			var viewer *int64
			if raw := middleware.SessionRawFromRequest(c); raw != "" {
				if uid, aerr := h.auth.UserIDFromSession(c.Context(), raw); aerr == nil {
					viewer = &uid
				}
			}
			items, err = h.svc.ListLatest(c.Context(), viewer, limit)
		default:
			return fiber.NewError(fiber.StatusBadRequest, "invalid scope (use mine or following)")
		}
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(items)
}

func (h *ItemHandler) Get(c *fiber.Ctx) error {
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var viewer *int64
	raw := middleware.SessionRawFromRequest(c)
	if raw != "" {
		uid, aerr := h.auth.UserIDFromSession(c.Context(), raw)
		if aerr == nil {
			viewer = &uid
		}
	}
	item, err := h.svc.Get(c.Context(), id, viewer)
	if errors.Is(err, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(item)
}

// ListRefsContainingItem returns lists the viewer may see that include this item (same visibility rules as GET /items/:id).
func (h *ItemHandler) ListRefsContainingItem(c *fiber.Ctx) error {
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var viewer *int64
	raw := middleware.SessionRawFromRequest(c)
	if raw != "" {
		uid, aerr := h.auth.UserIDFromSession(c.Context(), raw)
		if aerr == nil {
			viewer = &uid
		}
	}
	if _, err := h.svc.Get(c.Context(), id, viewer); errors.Is(err, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	} else if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if h.list == nil {
		return c.JSON([]models.ListRef{})
	}
	refs, err := h.list.ListRefsContainingItemForViewer(c.Context(), id, viewer)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(refs)
}

func (h *ItemHandler) Enrichment(c *fiber.Ctx) error {
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var viewer *int64
	raw := middleware.SessionRawFromRequest(c)
	if raw != "" {
		uid, aerr := h.auth.UserIDFromSession(c.Context(), raw)
		if aerr == nil {
			viewer = &uid
		}
	}
	item, err := h.svc.Get(c.Context(), id, viewer)
	if errors.Is(err, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if h.meta == nil {
		return c.JSON(service.ItemEnrichment{Note: "Summaries aren’t available on this server yet."})
	}
	out := h.meta.EnrichItem(c.Context(), item.Category, item.Metadata, item.Title)
	return c.JSON(out)
}

// ItemBody is the JSON body for creating or updating an item.
type ItemBody struct {
	CollectionID      string                    `json:"collection_id"`
	Title             string                    `json:"title"`
	Category          models.Category           `json:"category"`
	Metadata          json.RawMessage           `json:"metadata"`
	Rating            *int                      `json:"rating"`
	ConsumptionStatus *models.ConsumptionStatus `json:"consumption_status"`
}

func (h *ItemHandler) Create(c *fiber.Ctx) error {
	uid, err := h.requireUserID(c)
	if err != nil {
		return err
	}
	var body ItemBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	cid := strings.TrimSpace(body.CollectionID)
	if cid == "" {
		if h.coll == nil {
			return fiber.NewError(fiber.StatusInternalServerError, "server misconfigured")
		}
		var rerr error
		cid, rerr = h.coll.ResolveDefaultCollectionForItemCreate(c.Context(), uid)
		if rerr != nil {
			return fiber.NewError(fiber.StatusBadRequest, rerr.Error())
		}
	}
	if err := h.assertMayMutateCollection(c, uid, cid); err != nil {
		return err
	}
	item, err := h.svc.Create(c.Context(), service.CreateItemInput{
		CollectionID: cid,
		Title:        body.Title,
		Category:     body.Category,
		Metadata:     body.Metadata,
		Rating:       body.Rating,
		Consumption:  body.ConsumptionStatus,
	})
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if h.fanout != nil && h.coll != nil {
		if fctx, ferr := h.coll.GetFanoutContextByCollectionID(c.Context(), item.CollectionID); ferr == nil {
			h.fanout.NotifyItemAdded(c.Context(), uid, fctx.OwnerID, fctx.Visibility, item.CollectionID, fctx.Name, item.ID, item.Title, item.Rating)
		}
	}
	return c.Status(fiber.StatusCreated).JSON(item)
}

func (h *ItemHandler) Update(c *fiber.Ctx) error {
	uid, err := h.requireUserID(c)
	if err != nil {
		return err
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	raw := c.Body()
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(raw, &keys); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	var body ItemBody
	if err := json.Unmarshal(raw, &body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	existing, gerr := h.svc.Get(c.Context(), id, &uid)
	if errors.Is(gerr, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if gerr != nil {
		return fiber.NewError(fiber.StatusInternalServerError, gerr.Error())
	}
	if err := h.assertMayMutateCollection(c, uid, existing.CollectionID); err != nil {
		return err
	}
	var newColl *string
	if _, has := keys["collection_id"]; has {
		rawCID := keys["collection_id"]
		if bytes.Equal(bytes.TrimSpace(rawCID), []byte("null")) {
			return fiber.NewError(fiber.StatusBadRequest, "collection_id must be a UUID string")
		}
		var cid string
		if err := json.Unmarshal(rawCID, &cid); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid collection_id")
		}
		cid = strings.TrimSpace(cid)
		if cid == "" {
			return fiber.NewError(fiber.StatusBadRequest, "invalid collection_id")
		}
		if _, perr := httpx.PathUUID(cid); perr != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid collection_id")
		}
		if cid != existing.CollectionID {
			if err := h.assertMayMutateCollection(c, uid, cid); err != nil {
				return err
			}
			newColl = &cid
		}
	}
	var ru *models.RatingUpdate
	if _, has := keys["rating"]; has {
		if body.Rating == nil {
			ru = &models.RatingUpdate{SetNull: true}
		} else {
			if *body.Rating < 1 || *body.Rating > 5 {
				return fiber.NewError(fiber.StatusBadRequest, "rating must be between 1 and 5")
			}
			ru = &models.RatingUpdate{SetNull: false, Stars: *body.Rating}
		}
	}
	var consumption *models.ConsumptionStatus
	if _, has := keys["consumption_status"]; has {
		rawCS := keys["consumption_status"]
		if bytes.Equal(bytes.TrimSpace(rawCS), []byte("null")) {
			return fiber.NewError(fiber.StatusBadRequest, "consumption_status cannot be null")
		}
		var st models.ConsumptionStatus
		if err := json.Unmarshal(rawCS, &st); err != nil || !st.Valid() {
			return fiber.NewError(fiber.StatusBadRequest, "consumption_status must be pending or done")
		}
		consumption = &st
	}
	item, err := h.svc.Update(c.Context(), id, service.UpdateItemInput{
		Title:           body.Title,
		Category:        body.Category,
		Metadata:        body.Metadata,
		Rating:          ru,
		Consumption:     consumption,
		NewCollectionID: newColl,
	})
	if errors.Is(err, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if h.fanout != nil && h.coll != nil && ru != nil && !ru.SetNull {
		if fctx, ferr := h.coll.GetFanoutContextByCollectionID(c.Context(), item.CollectionID); ferr == nil {
			h.fanout.NotifyItemRated(c.Context(), uid, fctx.OwnerID, fctx.Visibility, item.CollectionID, fctx.Name, item.ID, item.Title, ru.Stars)
		}
	}
	return c.JSON(item)
}

func (h *ItemHandler) Delete(c *fiber.Ctx) error {
	uid, err := h.requireUserID(c)
	if err != nil {
		return err
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	existing, gerr := h.svc.Get(c.Context(), id, &uid)
	if errors.Is(gerr, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if gerr != nil {
		return fiber.NewError(fiber.StatusInternalServerError, gerr.Error())
	}
	if err := h.assertMayMutateCollection(c, uid, existing.CollectionID); err != nil {
		return err
	}
	if err := h.svc.Delete(c.Context(), id); err != nil {
		if errors.Is(err, repository.ErrItemNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}
