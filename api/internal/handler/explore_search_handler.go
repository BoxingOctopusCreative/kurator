package handler

import (
	"errors"
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type ExploreSearchHandler struct {
	svc *service.ExploreSearchService
}

func NewExploreSearchHandler(svc *service.ExploreSearchService) *ExploreSearchHandler {
	return &ExploreSearchHandler{svc: svc}
}

// Search finds publicly accessible shelves, boards, threads, replies, hitlist comments, and profiles.
// @Summary Explore search
// @Tags explore
// @Produce json
// @Param q query string true "Search text (min 2 characters)"
// @Param limit query int false "Max hits per category (default 5, max 12)"
// @Success 200 {object} models.ExploreSearchResponse
// @Failure 400 {object} map[string]string
// @Router /api/v1/explore/search [get]
func (h *ExploreSearchHandler) Search(c *fiber.Ctx) error {
	q := c.Query("q", "")
	limit, _ := strconv.Atoi(c.Query("limit", "5"))
	res, err := h.svc.Search(c.Context(), q, viewerPtr(c), limit)
	if err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(res)
}
