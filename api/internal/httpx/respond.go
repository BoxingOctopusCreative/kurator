package httpx

import (
	"errors"

	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/getsentry/sentry-go"
	"github.com/gofiber/fiber/v2"
)

// GenericClientMessage is returned for unexpected server errors so clients never see internal details.
const GenericClientMessage = "Something went wrong. Please try again."

// ServiceError maps a service-layer error to an HTTP response. Known validation and business-rule
// errors return a safe client message; everything else is reported to Sentry and returns GenericClientMessage.
func ServiceError(defaultStatus int, err error) error {
	if err == nil {
		return nil
	}
	if msg, code, ok := clientError(err); ok {
		return fiber.NewError(code, msg)
	}
	sentry.CaptureException(err)
	return fiber.NewError(defaultStatus, GenericClientMessage)
}

func clientError(err error) (message string, status int, ok bool) {
	var inv *validation.InvalidInputError
	if errors.As(err, &inv) {
		return inv.Message, fiber.StatusBadRequest, true
	}
	if errors.Is(err, service.ErrPublicHitlistRequiresSlug) {
		return service.ErrPublicHitlistRequiresSlug.Error(), fiber.StatusBadRequest, true
	}
	if errors.Is(err, repository.ErrListSlugTaken) {
		return "That link is already in use.", fiber.StatusConflict, true
	}
	return "", 0, false
}
