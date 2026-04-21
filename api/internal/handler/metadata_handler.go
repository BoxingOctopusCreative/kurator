package handler

import (
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type MetadataHandler struct {
	svc *service.MetadataService
}

func NewMetadataHandler(svc *service.MetadataService) *MetadataHandler {
	return &MetadataHandler{svc: svc}
}

// Lookup queries external catalogs (Discogs, games, books, TMDB, comics, Jikan) based on category/provider.
// @Summary Metadata lookup
// @Tags metadata
// @Produce json
// @Param q query string false "Search text (alias: query)"
// @Param query query string false "Alias for q"
// @Param category query string false "music, game, book, movies, tv, anime, comic_book, manga"
// @Param provider query string false "discogs, thegamesdb, book, tmdb, comic, comicvine, jikan, auto"
// @Success 200 {object} service.MetadataLookupResult
// @Router /api/v1/metadata/lookup [get]
func (h *MetadataHandler) Lookup(c *fiber.Ctx) error {
	qRaw := strings.TrimSpace(c.Query("q", c.Query("query", "")))
	q, err := validation.MetadataLookupQuery(qRaw, "Search")
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	provider, err := validation.MetadataProvider(c.Query("provider", ""))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	category, err := validation.MetadataCategory(c.Query("category", ""))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	p := resolveMetadataProvider(category, provider)
	res := h.svc.Lookup(c.Context(), p, q)
	return c.JSON(res)
}

func resolveMetadataProvider(category, provider string) string {
	p := strings.ToLower(strings.TrimSpace(provider))
	if p != "" && p != "auto" {
		return p
	}
	switch strings.ToLower(category) {
	case "music":
		return "discogs"
	case "game":
		return "thegamesdb"
	case "book":
		return "book"
	case "movies", "tv", "anime":
		return "tmdb"
	case "comic_book":
		return "comic"
	case "manga":
		return "jikan"
	default:
		if p != "" {
			return p
		}
		return "auto"
	}
}
