package handler

import (
	"errors"

	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type BillingHandler struct {
	svc *service.BillingService
}

func NewBillingHandler(svc *service.BillingService) *BillingHandler {
	return &BillingHandler{svc: svc}
}

type CreateCheckoutSessionBody struct {
	Interval string `json:"interval"`
}

// CreateCheckoutSession creates a Stripe Checkout session for Kurator Pro.
// @Summary Create Stripe Checkout session
// @Tags billing
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body CreateCheckoutSessionBody true "monthly or annual"
// @Success 200 {object} map[string]string
// @Router /api/v1/billing/create-checkout-session [post]
func (h *BillingHandler) CreateCheckoutSession(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body CreateCheckoutSessionBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	url, err := h.svc.CreateCheckoutSession(c.Context(), uid, body.Interval)
	if err != nil {
		return billingError(err)
	}
	return c.JSON(fiber.Map{"url": url})
}

// CreatePortalSession creates a Stripe Customer Portal session.
// @Summary Create Stripe Customer Portal session
// @Tags billing
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]string
// @Router /api/v1/billing/portal [post]
func (h *BillingHandler) CreatePortalSession(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	url, err := h.svc.CreatePortalSession(c.Context(), uid)
	if err != nil {
		return billingError(err)
	}
	return c.JSON(fiber.Map{"url": url})
}

type SwitchBillingIntervalBody struct {
	Interval string `json:"interval"`
}

// SwitchInterval changes an active Pro subscription between monthly and annual pricing.
// @Summary Switch Pro billing interval
// @Tags billing
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body SwitchBillingIntervalBody true "monthly or annual"
// @Success 200 {object} map[string]bool
// @Router /api/v1/billing/switch-interval [post]
func (h *BillingHandler) SwitchInterval(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body SwitchBillingIntervalBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.svc.SwitchSubscriptionInterval(c.Context(), uid, body.Interval); err != nil {
		return billingError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

// StripeWebhook handles Stripe webhook events (raw body; no auth).
// Subscribes to checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, and invoice.payment_failed.
// @Summary Stripe webhook
// @Tags billing
// @Accept json
// @Produce json
// @Success 200 {object} map[string]bool
// @Router /webhooks/stripe [post]
func (h *BillingHandler) StripeWebhook(c *fiber.Ctx) error {
	payload := c.Body()
	sig := c.Get("Stripe-Signature")
	if len(payload) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "empty body")
	}
	if err := h.svc.HandleWebhook(payload, sig); err != nil {
		if errors.Is(err, service.ErrBillingNotConfigured) {
			return fiber.NewError(fiber.StatusServiceUnavailable, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(fiber.Map{"received": true})
}

func billingError(err error) error {
	switch {
	case errors.Is(err, service.ErrBillingNotConfigured):
		return fiber.NewError(fiber.StatusServiceUnavailable, err.Error())
	case errors.Is(err, service.ErrBillingAlreadyPro):
		return fiber.NewError(fiber.StatusConflict, err.Error())
	case errors.Is(err, service.ErrBillingNoCustomer):
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrBillingNoSubscription):
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrBillingSameInterval):
		return fiber.NewError(fiber.StatusConflict, err.Error())
	case errors.Is(err, service.ErrBillingCannotSwitch):
		return fiber.NewError(fiber.StatusConflict, err.Error())
	default:
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, "billing error")
	}
}
