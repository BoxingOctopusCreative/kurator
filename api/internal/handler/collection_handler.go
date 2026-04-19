package handler

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type CollectionHandler struct {
	svc   *service.CollectionService
	auth  *service.AuthService
	items *service.ItemService
	coll  *repository.PostgresCollectionRepository
}

func NewCollectionHandler(
	svc *service.CollectionService,
	auth *service.AuthService,
	items *service.ItemService,
	coll *repository.PostgresCollectionRepository,
) *CollectionHandler {
	return &CollectionHandler{svc: svc, auth: auth, items: items, coll: coll}
}

func (h *CollectionHandler) assertCollectionOwner(c *fiber.Ctx, collectionID int64) (int64, error) {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return 0, fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	owned, err := h.coll.IsUserOwnedCollection(c.Context(), collectionID, uid)
	if err != nil {
		if errors.Is(err, repository.ErrCollectionNotFound) {
			return 0, fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return 0, fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if !owned {
		return 0, fiber.NewError(fiber.StatusForbidden, "only the collection owner can import or export items")
	}
	return uid, nil
}

// ExportItemsCSV returns all items in the collection as CSV (owner only).
// @Summary Export collection items as CSV
// @Tags collections
// @Produce text/csv
// @Param id path int true "Collection ID"
// @Success 200 {string} string "CSV file"
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/collections/{id}/items.csv [get]
func (h *CollectionHandler) ExportItemsCSV(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if _, err := h.assertCollectionOwner(c, id); err != nil {
		return err
	}
	b, err := h.items.ExportCollectionItemsCSV(c.Context(), id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="collection-%d-items.csv"`, id))
	return c.Send(b)
}

// ImportItemsCSV accepts multipart form field "file" (CSV). Creates new rows; non-empty id updates existing items in this collection.
// @Summary Import items from CSV
// @Tags collections
// @Accept multipart/form-data
// @Produce json
// @Param id path int true "Collection ID"
// @Param file formData file true "CSV file"
// @Success 200 {object} service.ImportItemsResult
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /api/v1/collections/{id}/items/import [post]
func (h *CollectionHandler) ImportItemsCSV(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if _, err := h.assertCollectionOwner(c, id); err != nil {
		return err
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

	res, err := h.items.ImportCollectionItemsFromCSV(c.Context(), id, fh)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(res)
}

// List supports optional auth. Visibility rules use legacy shared collections (user_id NULL),
// public user collections, and private collections visible only to the owner.
// @Summary List collections
// @Tags collections
// @Produce json
// @Param q query string false "Search name/description"
// @Param sort query string false "name_asc, etc."
// @Param has_description query string false "Filter"
// @Param scope query string false "all or following"
// @Param owner_user_id query int false "Filter by owner user id"
// @Param page query int false "Page (default 1)"
// @Param limit query int false "Page size (default 12)"
// @Success 200 {object} service.CollectionListResult
// @Failure 500 {object} map[string]string
// @Router /api/v1/collections [get]
func (h *CollectionHandler) List(c *fiber.Ctx) error {
	var viewer *int64
	raw := c.Cookies(middleware.SessionCookieName)
	if raw != "" {
		uid, err := h.auth.UserIDFromSession(c.Context(), raw)
		if err == nil {
			viewer = &uid
		}
	}

	q := c.Query("q")
	sort := c.Query("sort", "name_asc")
	hasDesc := c.Query("has_description")
	scope := c.Query("scope", "all")

	var ownerUserID *int64
	if ou := c.Query("owner_user_id"); ou != "" {
		n, err := strconv.ParseInt(ou, 10, 64)
		if err != nil || n < 1 {
			return fiber.NewError(fiber.StatusBadRequest, "invalid owner_user_id")
		}
		ownerUserID = &n
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "12"))

	res, err := h.svc.List(c.Context(), viewer, q, sort, hasDesc, scope, ownerUserID, page, limit)
	if err != nil {
		st := fiber.StatusInternalServerError
		if err.Error() == "sign in to view collections from people you follow" {
			st = fiber.StatusUnauthorized
		}
		return fiber.NewError(st, err.Error())
	}
	return c.JSON(res)
}

// Get returns one collection when the viewer may access it (optional session cookie).
// @Summary Get collection
// @Tags collections
// @Produce json
// @Param id path int true "Collection ID"
// @Success 200 {object} models.Collection
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/collections/{id} [get]
func (h *CollectionHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var viewer *int64
	raw := c.Cookies(middleware.SessionCookieName)
	if raw != "" {
		uid, err := h.auth.UserIDFromSession(c.Context(), raw)
		if err == nil {
			viewer = &uid
		}
	}
	col, err := h.svc.Get(c.Context(), id, viewer)
	if errors.Is(err, repository.ErrCollectionNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(col)
}

// CreateCollectionBody is the JSON body for POST /collections.
type CreateCollectionBody struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPublic    *bool  `json:"is_public"`
}

// Create adds a collection for the signed-in user (requires session).
// @Summary Create collection
// @Tags collections
// @Accept json
// @Produce json
// @Param body body CreateCollectionBody true "Collection"
// @Success 201 {object} models.Collection
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/collections [post]
func (h *CollectionHandler) Create(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body CreateCollectionBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	col, err := h.svc.Create(c.Context(), uid, body.Name, body.Description, body.IsPublic)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(col)
}

// PatchCollectionBody is the JSON body for PATCH /collections/:id.
type PatchCollectionBody struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	IsPublic    *bool   `json:"is_public"`
}

// Patch updates a collection owned by the signed-in user.
func (h *CollectionHandler) Patch(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body PatchCollectionBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	col, err := h.svc.Patch(c.Context(), uid, id, body.Name, body.Description, body.IsPublic)
	if errors.Is(err, repository.ErrCollectionNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(col)
}
