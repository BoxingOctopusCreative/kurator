package handler

import (
	"errors"
	"strconv"

	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type SearchHandler struct {
	svc *service.SearchService
}

func NewSearchHandler(svc *service.SearchService) *SearchHandler {
	return &SearchHandler{svc: svc}
}

// Search runs full-text search when Meilisearch is configured; otherwise returns an empty hit list.
// @Summary Search items
// @Tags search
// @Produce json
// @Param q query string false "Query"
// @Param limit query int false "Max hits (default 20)"
// @Success 200 {object} map[string]interface{}
// @Failure 502 {object} map[string]string
// @Router /api/v1/search [get]
func (h *SearchHandler) Search(c *fiber.Ctx) error {
	q := c.Query("q", "")
	limit, _ := strconv.ParseInt(c.Query("limit", "20"), 10, 64)
	res, err := h.svc.Search(c.Context(), q, limit)
	if err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		return fiber.NewError(fiber.StatusBadGateway, err.Error())
	}
	return c.JSON(res)
}
