package handler

import (
	"errors"
	"io"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type ImageHandler struct {
	svc *service.ImageService
}

func NewImageHandler(svc *service.ImageService) *ImageHandler {
	return &ImageHandler{svc: svc}
}

// ImageFromURLBody is the JSON body for remote image import when Content-Type is application/json.
type ImageFromURLBody struct {
	URL string `json:"url"`
}

// Upload accepts multipart form field "file" or JSON {"url":"https://..."} for remote import. Requires S3 (or compatible) configuration on the server.
// @Summary Upload image
// @Tags images
// @Security SessionCookie
// @Accept multipart/form-data
// @Accept json
// @Produce json
// @Param file formData file false "Image file (multipart)"
// @Param body body ImageFromURLBody false "Remote URL (JSON body)"
// @Success 200 {object} map[string]string "url"
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 413 {object} map[string]string
// @Failure 503 {object} map[string]string "storage not configured"
// @Router /api/v1/images [post]
func (h *ImageHandler) Upload(c *fiber.Ctx) error {
	if h.svc == nil || !h.svc.Configured() {
		return fiber.NewError(fiber.StatusServiceUnavailable, "image storage is not configured")
	}
	ct := strings.ToLower(string(c.Request().Header.ContentType()))
	if strings.HasPrefix(ct, "multipart/form-data") {
		fh, err := c.FormFile("file")
		if err != nil || fh == nil {
			return fiber.NewError(fiber.StatusBadRequest, "missing file field")
		}
		f, err := fh.Open()
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "cannot read file")
		}
		defer f.Close()
		data, err := io.ReadAll(io.LimitReader(f, 10*1024*1024+1))
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "cannot read file")
		}
		if len(data) > 10*1024*1024 {
			return fiber.NewError(fiber.StatusRequestEntityTooLarge, service.ErrImageTooLarge.Error())
		}
		kind := c.Query("kind", "")
		url, err := h.svc.UploadBytes(c.Context(), data, kind)
		if err != nil {
			return mapImageError(err)
		}
		return c.JSON(fiber.Map{"url": url})
	}

	if !strings.HasPrefix(ct, "application/json") {
		return fiber.NewError(fiber.StatusBadRequest, "send multipart file field \"file\" or JSON {\"url\":\"...\"}")
	}

	var body ImageFromURLBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if _, err := validation.HTTPOrHTTPSURL(body.URL, "URL"); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	kind := c.Query("kind", "")
	url, err := h.svc.UploadFromURL(c.Context(), body.URL, kind)
	if err != nil {
		return mapImageError(err)
	}
	return c.JSON(fiber.Map{"url": url})
}

func mapImageError(err error) error {
	switch {
	case errors.Is(err, service.ErrImageTooLarge):
		return fiber.NewError(fiber.StatusRequestEntityTooLarge, err.Error())
	case errors.Is(err, service.ErrInvalidImage):
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrImageNotConfigured):
		return fiber.NewError(fiber.StatusServiceUnavailable, err.Error())
	default:
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
}
