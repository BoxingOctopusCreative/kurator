package httpx_test

import (
	"errors"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/httpx"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

func TestServiceError_validation(t *testing.T) {
	err := httpx.ServiceError(fiber.StatusBadRequest, validation.Invalidf("Name is required"))
	var fe *fiber.Error
	if !errors.As(err, &fe) {
		t.Fatalf("expected fiber.Error, got %T", err)
	}
	if fe.Code != fiber.StatusBadRequest || fe.Message != "Name is required" {
		t.Fatalf("got code=%d msg=%q", fe.Code, fe.Message)
	}
}

func TestServiceError_publicSlugRequired(t *testing.T) {
	err := httpx.ServiceError(fiber.StatusBadRequest, service.ErrPublicHitlistRequiresSlug)
	var fe *fiber.Error
	if !errors.As(err, &fe) {
		t.Fatalf("expected fiber.Error, got %T", err)
	}
	if fe.Code != fiber.StatusBadRequest || fe.Message != service.ErrPublicHitlistRequiresSlug.Error() {
		t.Fatalf("got code=%d msg=%q", fe.Code, fe.Message)
	}
}

func TestServiceError_slugTaken(t *testing.T) {
	err := httpx.ServiceError(fiber.StatusBadRequest, repository.ErrListSlugTaken)
	var fe *fiber.Error
	if !errors.As(err, &fe) {
		t.Fatalf("expected fiber.Error, got %T", err)
	}
	if fe.Code != fiber.StatusConflict || fe.Message != "That link is already in use." {
		t.Fatalf("got code=%d msg=%q", fe.Code, fe.Message)
	}
}

func TestServiceError_unexpected(t *testing.T) {
	err := httpx.ServiceError(fiber.StatusInternalServerError, errors.New("db: connection reset"))
	var fe *fiber.Error
	if !errors.As(err, &fe) {
		t.Fatalf("expected fiber.Error, got %T", err)
	}
	if fe.Code != fiber.StatusInternalServerError || fe.Message != httpx.GenericClientMessage {
		t.Fatalf("got code=%d msg=%q", fe.Code, fe.Message)
	}
}
