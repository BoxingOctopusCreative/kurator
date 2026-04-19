package handler

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type ItemHandler struct {
	svc  *service.ItemService
	coll *repository.PostgresCollectionRepository
	auth *service.AuthService
	meta *service.MetadataService
}

func NewItemHandler(svc *service.ItemService, coll *repository.PostgresCollectionRepository, auth *service.AuthService, meta *service.MetadataService) *ItemHandler {
	return &ItemHandler{svc: svc, coll: coll, auth: auth, meta: meta}
}

// List returns recent items, or items for collection_id when set. Optional session cookie can unlock private collections.
// Query scope: omit or empty = global latest; "mine" = signed-in user's collections; "following" = public collections of followed users (requires session).
// @Summary List items
// @Tags items
// @Produce json
// @Param limit query int false "Max items (default 24)"
// @Param collection_id query int false "Filter by collection"
// @Param scope query string false "mine | following (requires login; ignored when collection_id is set)"
// @Success 200 {array} models.Item
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/items [get]
func (h *ItemHandler) List(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "24"))
	var (
		items []models.Item
		err   error
	)
	if cid := c.Query("collection_id"); cid != "" {
		id, perr := strconv.ParseInt(cid, 10, 64)
		if perr != nil || id < 1 {
			return fiber.NewError(fiber.StatusBadRequest, "invalid collection_id")
		}
		var viewer *int64
		raw := c.Cookies(middleware.SessionCookieName)
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
		items, err = h.svc.ListByCollection(c.Context(), id, limit)
	} else {
		scope := strings.TrimSpace(strings.ToLower(c.Query("scope")))
		switch scope {
		case "mine", "following":
			raw := c.Cookies(middleware.SessionCookieName)
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
			items, err = h.svc.ListLatest(c.Context(), limit)
		default:
			return fiber.NewError(fiber.StatusBadRequest, "invalid scope (use mine or following)")
		}
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(items)
}

// Get returns one item by id.
// @Summary Get item
// @Tags items
// @Produce json
// @Param id path int true "Item ID"
// @Success 200 {object} models.Item
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/items/{id} [get]
func (h *ItemHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	item, err := h.svc.Get(c.Context(), id)
	if errors.Is(err, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if h.coll != nil {
		var viewer *int64
		raw := c.Cookies(middleware.SessionCookieName)
		if raw != "" {
			uid, aerr := h.auth.UserIDFromSession(c.Context(), raw)
			if aerr == nil {
				viewer = &uid
			}
		}
		if _, cerr := h.coll.GetByID(c.Context(), item.CollectionID, viewer); errors.Is(cerr, repository.ErrCollectionNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		} else if cerr != nil {
			return fiber.NewError(fiber.StatusInternalServerError, cerr.Error())
		}
	}
	return c.JSON(item)
}

// Enrichment returns synopsis/plot text from external catalogs (TMDB, Jikan, Google Books, etc.) when API keys allow.
// @Summary Item enrichment (synopsis)
// @Tags items
// @Produce json
// @Param id path int true "Item ID"
// @Success 200 {object} service.ItemEnrichment
// @Failure 404 {object} map[string]string
// @Router /api/v1/items/{id}/enrichment [get]
func (h *ItemHandler) Enrichment(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	item, err := h.svc.Get(c.Context(), id)
	if errors.Is(err, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if h.coll != nil {
		var viewer *int64
		raw := c.Cookies(middleware.SessionCookieName)
		if raw != "" {
			uid, aerr := h.auth.UserIDFromSession(c.Context(), raw)
			if aerr == nil {
				viewer = &uid
			}
		}
		if _, cerr := h.coll.GetByID(c.Context(), item.CollectionID, viewer); errors.Is(cerr, repository.ErrCollectionNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		} else if cerr != nil {
			return fiber.NewError(fiber.StatusInternalServerError, cerr.Error())
		}
	}
	if h.meta == nil {
		return c.JSON(service.ItemEnrichment{Note: "Summaries aren’t available on this server yet."})
	}
	out := h.meta.EnrichItem(c.Context(), item.Category, item.Metadata, item.Title)
	return c.JSON(out)
}

// ItemBody is the JSON body for creating or updating an item.
type ItemBody struct {
	CollectionID int64           `json:"collection_id"`
	Title        string          `json:"title"`
	Category     models.Category `json:"category"`
	Metadata     json.RawMessage `json:"metadata"`
}

// Create adds an item (defaults collection_id to 1 when zero).
// @Summary Create item
// @Tags items
// @Accept json
// @Produce json
// @Param body body ItemBody true "Item"
// @Success 201 {object} models.Item
// @Failure 400 {object} map[string]string
// @Router /api/v1/items [post]
func (h *ItemHandler) Create(c *fiber.Ctx) error {
	var body ItemBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	item, err := h.svc.Create(c.Context(), service.CreateItemInput{
		CollectionID: body.CollectionID,
		Title:        body.Title,
		Category:     body.Category,
		Metadata:     body.Metadata,
	})
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(item)
}

// Update replaces title, category, and metadata for an item.
// @Summary Update item
// @Tags items
// @Accept json
// @Produce json
// @Param id path int true "Item ID"
// @Param body body ItemBody true "Fields"
// @Success 200 {object} models.Item
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/items/{id} [put]
func (h *ItemHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body ItemBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	item, err := h.svc.Update(c.Context(), id, service.UpdateItemInput{
		Title:    body.Title,
		Category: body.Category,
		Metadata: body.Metadata,
	})
	if errors.Is(err, repository.ErrItemNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(item)
}

// Delete removes an item by id.
// @Summary Delete item
// @Tags items
// @Param id path int true "Item ID"
// @Success 204
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/items/{id} [delete]
func (h *ItemHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.svc.Delete(c.Context(), id); err != nil {
		if errors.Is(err, repository.ErrItemNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}
