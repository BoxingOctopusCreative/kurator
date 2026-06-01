package handler

import (
	"errors"

	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type OnboardingHandler struct {
	svc *service.OnboardingService
}

func NewOnboardingHandler(svc *service.OnboardingService) *OnboardingHandler {
	return &OnboardingHandler{svc: svc}
}

// OnboardingAdvanceBody is the JSON body for PATCH /api/v1/me/onboarding.
type OnboardingAdvanceBody struct {
	OnboardingStep    *int  `json:"onboarding_step"`
	OnboardingComplete *bool `json:"onboarding_completed"`
}

// GetOnboarding returns onboarding progress for the signed-in user.
// @Summary Get onboarding status
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} service.OnboardingStatus
// @Router /api/v1/me/onboarding [get]
func (h *OnboardingHandler) GetOnboarding(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	st, err := h.svc.GetStatus(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(st)
}

// PatchOnboarding advances onboarding after server-side validation.
// @Summary Update onboarding progress
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body OnboardingAdvanceBody true "Target step"
// @Success 200 {object} service.OnboardingStatus
// @Router /api/v1/me/onboarding [patch]
func (h *OnboardingHandler) PatchOnboarding(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body OnboardingAdvanceBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	nextStep := 0
	if body.OnboardingStep != nil {
		nextStep = *body.OnboardingStep
	}
	markComplete := body.OnboardingComplete != nil && *body.OnboardingComplete
	if nextStep < 1 && !markComplete {
		return fiber.NewError(fiber.StatusBadRequest, "onboarding_step or onboarding_completed required")
	}
	if markComplete && nextStep < 1 {
		nextStep = 5
	}
	st, err := h.svc.AdvanceStep(c.Context(), uid, nextStep, markComplete)
	if err != nil {
		if errors.Is(err, service.ErrOnboardingStepIncomplete) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		if errors.Is(err, service.ErrOnboardingStepInvalid) || errors.Is(err, service.ErrOnboardingAlreadyComplete) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(st)
}
