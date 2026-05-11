package handler

import (
	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

// resolveVisibility derives a *models.Visibility from a request payload that may carry either a
// new tri-state "visibility" field or the legacy "is_public" boolean. Returns:
//   - (nil, nil)     when the caller did not specify either field (the service layer keeps the
//     stored value or applies its default).
//   - (*Visibility, nil)  when a value was supplied and validates.
//   - (nil, *fiber.Error) when "visibility" is set to an unrecognised value.
//
// The legacy boolean maps "true" → followers (the prior public default) and "false" → private.
func resolveVisibility(visibility *string, isPublic *bool) (*models.Visibility, error) {
	if visibility != nil {
		v, err := validation.Visibility(*visibility)
		if err != nil {
			return nil, fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		if v == "" {
			// Empty string after trimming — treat the same as "not provided".
			return nil, nil
		}
		return &v, nil
	}
	if isPublic != nil {
		v := models.VisibilityFromIsPublic(*isPublic)
		return &v, nil
	}
	return nil, nil
}
