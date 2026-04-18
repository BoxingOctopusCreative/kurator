package handler

import (
	"errors"
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type CollectionHandler struct {
	svc  *service.CollectionService
	auth *service.AuthService
}

func NewCollectionHandler(svc *service.CollectionService, auth *service.AuthService) *CollectionHandler {
	return &CollectionHandler{svc: svc, auth: auth}
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
