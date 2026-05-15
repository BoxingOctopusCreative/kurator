package handler

import (
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type DashboardHandler struct {
	svc *service.DashboardService
}

func NewDashboardHandler(svc *service.DashboardService) *DashboardHandler {
	return &DashboardHandler{svc: svc}
}

// RecentShelves returns the signed-in user's most recently updated shelves, optionally filtered
// by scope ("mine" default, or "following") and kind ("collection" | "list" | "wishlist").
// @Summary Recent shelves for dashboard
// @Tags dashboard
// @Produce json
// @Param scope query string false "mine (default) or following"
// @Param kind query string false "collection, list, or wishlist; omit for a mix"
// @Param limit query int false "1-30 (default 10)"
// @Param offset query int false "rows to skip after ordering by updated_at (default 0)"
// @Success 200 {array} models.DashboardShelf
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/me/shelves [get]
func (h *DashboardHandler) RecentShelves(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	scope := c.Query("scope", "mine")
	kind := c.Query("kind", "")
	limit, _ := strconv.Atoi(c.Query("limit", "0"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	res, err := h.svc.RecentShelves(c.Context(), uid, scope, kind, limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(res)
}
