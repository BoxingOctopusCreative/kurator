package handler

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type CustomThemeHandler struct {
	svc *service.CustomThemeService
}

func NewCustomThemeHandler(svc *service.CustomThemeService) *CustomThemeHandler {
	return &CustomThemeHandler{svc: svc}
}

type CustomThemeYAMLBody struct {
	YAML string `json:"yaml"`
}

type CustomThemeReportBody struct {
	Reason string `json:"reason"`
}

type InstallLibraryThemeBody struct {
	PublishedThemeID string `json:"published_theme_id"`
}

type SetActiveThemeBody struct {
	LibraryID *string `json:"library_id"`
}

// ValidateCustomTheme validates YAML against the customTheme v1 schema.
// @Summary Validate custom theme YAML
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body CustomThemeYAMLBody true "Theme YAML"
// @Success 200 {object} service.ValidationResult
// @Router /api/v1/me/custom-theme/validate [post]
func (h *CustomThemeHandler) Validate(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	raw, err := readThemeYAMLBody(c)
	if err != nil {
		return err
	}
	result := h.svc.ValidateYAML(c.Context(), uid, raw)
	if len(result.Errors) == 1 && result.Errors[0].Field == "plan" {
		return respondCustomThemeError(c, service.ErrCustomThemeProRequired)
	}
	return c.JSON(result)
}

// ListGoogleFonts returns Google Font family names for the theme editor autocomplete.
// @Summary List Google Font families
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme/google-fonts [get]
func (h *CustomThemeHandler) ListGoogleFonts(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	families, err := h.svc.ListGoogleFonts(c.Context(), uid)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	return c.JSON(fiber.Map{"families": families})
}

// GetMyCustomTheme returns the authenticated user's saved theme or defaults.
// @Summary Get my custom theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme [get]
func (h *CustomThemeHandler) GetMine(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	row, err := h.svc.GetMine(c.Context(), uid)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	resp := userThemeJSON(row)
	if row.ThemeID != uuid.Nil {
		count, countErr := h.svc.PublishedVersionCount(c.Context(), uid, row.ThemeID)
		if countErr == nil {
			resp["published_version_count"] = count
		}
	}
	return c.JSON(resp)
}

// SaveCustomTheme validates and stores the user's custom theme YAML.
// @Summary Save custom theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body CustomThemeYAMLBody true "Theme YAML"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme [put]
func (h *CustomThemeHandler) Save(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	raw, err := readThemeYAMLBody(c)
	if err != nil {
		return err
	}
	row, result, err := h.svc.Save(c.Context(), uid, raw)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	if !result.Valid {
		return c.Status(fiber.StatusBadRequest).JSON(result)
	}
	return c.JSON(userThemeJSON(row))
}

// ResetCustomTheme removes the user's saved custom theme.
// @Summary Reset custom theme to defaults
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]bool
// @Router /api/v1/me/custom-theme [delete]
func (h *CustomThemeHandler) Reset(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	if err := h.svc.Reset(c.Context(), uid); err != nil {
		return respondCustomThemeError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// UnpublishCustomTheme removes all published marketplace versions of the user's theme.
// @Summary Unpublish custom theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme/unpublish [post]
func (h *CustomThemeHandler) Unpublish(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	themeName, activeCleared, err := h.svc.Unpublish(c.Context(), uid)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	return c.JSON(fiber.Map{
		"ok":             true,
		"theme_name":     themeName,
		"active_cleared": activeCleared,
	})
}

// DeleteCreatedCustomTheme deletes the user's custom theme draft (must be unpublished first).
// @Summary Delete created custom theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]bool
// @Router /api/v1/me/custom-theme/created [delete]
func (h *CustomThemeHandler) DeleteCreated(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	if err := h.svc.DeleteCreated(c.Context(), uid); err != nil {
		return respondCustomThemeError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// PublishCustomTheme publishes an immutable versioned theme artifact.
// @Summary Publish custom theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme/publish [post]
func (h *CustomThemeHandler) Publish(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	row, result, err := h.svc.Publish(c.Context(), uid)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	if !result.Valid {
		return c.Status(fiber.StatusBadRequest).JSON(result)
	}
	return c.JSON(publishedThemeJSON(*row))
}

// ListPublishedCustomThemes browses published themes.
// @Summary List published custom themes
// @Tags custom-themes
// @Produce json
// @Param q query string false "Search query"
// @Param limit query int false "Page size (max 50)"
// @Param offset query int false "Offset"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/custom-themes [get]
func (h *CustomThemeHandler) ListPublished(c *fiber.Ctx) error {
	q := c.Query("q", "")
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	items, total, err := h.svc.ListPublished(c.Context(), q, limit, offset)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	out := make([]fiber.Map, 0, len(items))
	for _, item := range items {
		out = append(out, publishedThemeJSON(item))
	}
	return c.JSON(fiber.Map{"items": out, "total": total})
}

// GetPublishedCustomTheme returns a published theme by id.
// @Summary Get published custom theme
// @Tags custom-themes
// @Produce json
// @Param id path string true "Published theme UUID"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/custom-themes/{id} [get]
func (h *CustomThemeHandler) GetPublished(c *fiber.Ctx) error {
	id, err := uuid.Parse(strings.TrimSpace(c.Params("id")))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid theme id")
	}
	row, err := h.svc.GetPublished(c.Context(), id)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	return c.JSON(publishedThemeJSON(*row))
}

// ReportPublishedCustomTheme flags a published theme for moderation.
// @Summary Report published custom theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param id path string true "Published theme UUID"
// @Param body body CustomThemeReportBody true "Report reason"
// @Success 200 {object} map[string]bool
// @Router /api/v1/custom-themes/{id}/report [post]
func (h *CustomThemeHandler) Report(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	id, err := uuid.Parse(strings.TrimSpace(c.Params("id")))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid theme id")
	}
	var body CustomThemeReportBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.svc.ReportPublished(c.Context(), uid, id, body.Reason); err != nil {
		return respondCustomThemeError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ListCustomThemeLibrary returns themes in the user's library (own + marketplace installs).
// @Summary List custom theme library
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme/library [get]
func (h *CustomThemeHandler) ListLibrary(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	items, activeID, err := h.svc.ListLibrary(c.Context(), uid)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	out := make([]fiber.Map, 0, len(items))
	for _, item := range items {
		out = append(out, libraryThemeJSON(item))
	}
	resp := fiber.Map{"items": out}
	if activeID != nil {
		resp["active_custom_theme_library_id"] = activeID
	}
	return c.JSON(resp)
}

// InstallCustomThemeLibrary adds a published theme to the user's library.
// @Summary Install marketplace theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body InstallLibraryThemeBody true "Published theme id"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme/library [post]
func (h *CustomThemeHandler) InstallLibrary(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body InstallLibraryThemeBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	pubID, err := uuid.Parse(strings.TrimSpace(body.PublishedThemeID))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid published_theme_id")
	}
	row, err := h.svc.InstallMarketplace(c.Context(), uid, pubID)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	return c.JSON(libraryThemeJSON(*row))
}

// RemoveCustomThemeLibrary removes a marketplace install from the user's library.
// @Summary Remove theme from library
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Param id path string true "Library entry UUID"
// @Success 200 {object} map[string]bool
// @Router /api/v1/me/custom-theme/library/{id} [delete]
func (h *CustomThemeHandler) RemoveLibrary(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	libraryID, err := uuid.Parse(strings.TrimSpace(c.Params("id")))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid library id")
	}
	if err := h.svc.RemoveFromLibrary(c.Context(), uid, libraryID); err != nil {
		return respondCustomThemeError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// SetActiveCustomTheme selects or clears the active custom theme.
// @Summary Set active custom theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body SetActiveThemeBody true "Library entry id or null"
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme/active [patch]
func (h *CustomThemeHandler) SetActive(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body SetActiveThemeBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	var libraryID *uuid.UUID
	if body.LibraryID != nil {
		raw := strings.TrimSpace(*body.LibraryID)
		if raw != "" {
			id, parseErr := uuid.Parse(raw)
			if parseErr != nil {
				return fiber.NewError(fiber.StatusBadRequest, "invalid library_id")
			}
			libraryID = &id
		}
	}
	activeID, err := h.svc.SetActiveLibraryTheme(c.Context(), uid, libraryID)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	resp := fiber.Map{"ok": true}
	if activeID != nil {
		resp["active_custom_theme_library_id"] = activeID
	} else {
		resp["active_custom_theme_library_id"] = nil
	}
	return c.JSON(resp)
}

// GetActiveCustomTheme returns YAML for the user's active custom theme.
// @Summary Get active custom theme
// @Tags custom-themes
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/custom-theme/active [get]
func (h *CustomThemeHandler) GetActive(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	row, err := h.svc.GetActiveTheme(c.Context(), uid)
	if err != nil {
		return respondCustomThemeError(c, err)
	}
	if row == nil {
		return c.JSON(fiber.Map{"active": false})
	}
	return c.JSON(libraryThemeJSON(*row))
}

func readThemeYAMLBody(c *fiber.Ctx) ([]byte, error) {
	ct := strings.ToLower(string(c.Request().Header.ContentType()))
	if strings.HasPrefix(ct, "text/yaml") || strings.HasPrefix(ct, "application/x-yaml") {
		raw := c.Body()
		if len(raw) == 0 {
			return nil, fiber.NewError(fiber.StatusBadRequest, "empty YAML body")
		}
		return raw, nil
	}
	var body CustomThemeYAMLBody
	if err := c.BodyParser(&body); err != nil {
		return nil, fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if strings.TrimSpace(body.YAML) == "" {
		return nil, fiber.NewError(fiber.StatusBadRequest, "yaml is required")
	}
	return []byte(body.YAML), nil
}

func userThemeJSON(row *models.UserCustomTheme) fiber.Map {
	m := fiber.Map{
		"name":        row.Name,
		"description": row.Description,
		"yaml":        row.YAML,
	}
	if row.ThemeID != uuid.Nil {
		m["theme_id"] = row.ThemeID
	}
	if !row.UpdatedAt.IsZero() {
		m["updated_at"] = row.UpdatedAt
	}
	return m
}

func libraryThemeJSON(row models.CustomThemeLibraryEntry) fiber.Map {
	m := fiber.Map{
		"id":          row.ID,
		"source":      row.Source,
		"ref_id":      row.RefID,
		"name":        row.Name,
		"description": row.Description,
		"created_at":  row.CreatedAt.Format(time.RFC3339),
	}
	if row.YAML != "" {
		m["yaml"] = row.YAML
	}
	return m
}

func publishedThemeJSON(row models.PublishedCustomTheme) fiber.Map {
	m := fiber.Map{
		"id":                  row.ID,
		"theme_family_id":     row.ThemeFamilyID,
		"version":             row.Version,
		"author_display_name": row.AuthorDisplayName,
		"author_deleted":      row.AuthorDeleted,
		"name":                row.Name,
		"description":         row.Description,
		"created_at":          row.CreatedAt.Format(time.RFC3339),
	}
	if row.AuthorUserID != nil {
		m["author_user_id"] = *row.AuthorUserID
	}
	if row.AuthorProfileURL != nil {
		m["author_profile_url"] = *row.AuthorProfileURL
	}
	if row.YAML != "" {
		m["yaml"] = row.YAML
	}
	return m
}

func respondCustomThemeError(c *fiber.Ctx, err error) error {
	if errors.Is(err, service.ErrCustomThemeProRequired) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":   "pro_required",
			"message": "This feature requires Kurator Pro",
		})
	}
	switch {
	case errors.Is(err, service.ErrCustomThemeNotFound):
		return fiber.NewError(fiber.StatusNotFound, err.Error())
	case errors.Is(err, service.ErrCustomThemeNotPublished):
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrCustomThemeStillPublished):
		return fiber.NewError(fiber.StatusConflict, err.Error())
	case errors.Is(err, service.ErrCannotRemoveOwnLibraryEntry):
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	case errors.Is(err, repository.ErrPublishedThemeNotFound):
		return fiber.NewError(fiber.StatusNotFound, err.Error())
	case errors.Is(err, repository.ErrThemeLibraryNotFound):
		return fiber.NewError(fiber.StatusNotFound, err.Error())
	case errors.Is(err, repository.ErrThemeLibraryAlreadyInstalled):
		return fiber.NewError(fiber.StatusConflict, err.Error())
	case errors.Is(err, service.ErrCustomThemeRateLimited):
		return fiber.NewError(fiber.StatusTooManyRequests, err.Error())
	case errors.Is(err, service.ErrThemeStorageNotConfigured):
		return fiber.NewError(fiber.StatusServiceUnavailable, err.Error())
	default:
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, "custom theme error")
	}
}
