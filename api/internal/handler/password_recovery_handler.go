package handler

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/turnstile"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type PasswordRecoveryHandler struct {
	svc                *service.PasswordRecoveryService
	turnstileEnabled   bool
	turnstileSecretKey string
}

func NewPasswordRecoveryHandler(svc *service.PasswordRecoveryService, turnstileEnabled bool, turnstileSecretKey string) *PasswordRecoveryHandler {
	return &PasswordRecoveryHandler{
		svc:                svc,
		turnstileEnabled:   turnstileEnabled,
		turnstileSecretKey: strings.TrimSpace(turnstileSecretKey),
	}
}

// ForgotPasswordBody requests a 6-digit code via email.
type ForgotPasswordBody struct {
	Email          string `json:"email"`
	TurnstileToken string `json:"turnstile_token"`
}

// ForgotPassword sends a recovery code to the account email when Mailgun is configured.
// @Summary Request password recovery code
// @Tags auth
// @Accept json
// @Produce json
// @Param body body ForgotPasswordBody true "Email"
// @Success 200 {object} map[string]string
// @Router /api/v1/auth/forgot-password [post]
func (h *PasswordRecoveryHandler) ForgotPassword(c *fiber.Ctx) error {
	if h.svc == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "password recovery is not configured")
	}
	var body ForgotPasswordBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.verifyTurnstile(c, body.TurnstileToken); err != nil {
		return err
	}
	if _, err := validation.Email(body.Email, "Email"); err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if err := h.svc.RequestCode(c.Context(), body.Email); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{
		"ok":      true,
		"message": "If an account exists for that email, a recovery code has been sent.",
	})
}

// VerifyForgotPasswordBody verifies the 6-digit code from email.
type VerifyForgotPasswordBody struct {
	Email          string `json:"email"`
	Code           string `json:"code"`
	TurnstileToken string `json:"turnstile_token"`
}

// VerifyForgotPassword returns a short-lived reset_token after the code is verified.
// @Summary Verify recovery code
// @Tags auth
// @Accept json
// @Produce json
// @Param body body VerifyForgotPasswordBody true "Email and code"
// @Success 200 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/auth/forgot-password/verify [post]
func (h *PasswordRecoveryHandler) VerifyForgotPassword(c *fiber.Ctx) error {
	if h.svc == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "password recovery is not configured")
	}
	var body VerifyForgotPasswordBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.verifyTurnstile(c, body.TurnstileToken); err != nil {
		return err
	}
	if _, err := validation.Email(body.Email, "Email"); err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	tok, err := h.svc.VerifyCode(c.Context(), body.Email, body.Code)
	if err != nil {
		if errors.Is(err, service.ErrInvalidRecoveryCode) {
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"reset_token": tok})
}

// ResetForgotPasswordBody sets a new password using reset_token from verify.
type ResetForgotPasswordBody struct {
	ResetToken     string `json:"reset_token"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstile_token"`
}

// ResetForgotPassword completes the flow with a new password (sessions revoked).
// @Summary Reset password after recovery
// @Tags auth
// @Accept json
// @Produce json
// @Param body body ResetForgotPasswordBody true "Reset token and new password"
// @Success 204
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/auth/forgot-password/reset [post]
func (h *PasswordRecoveryHandler) ResetForgotPassword(c *fiber.Ctx) error {
	if h.svc == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "password recovery is not configured")
	}
	var body ResetForgotPasswordBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.verifyTurnstile(c, body.TurnstileToken); err != nil {
		return err
	}
	if err := h.svc.ResetPassword(c.Context(), body.ResetToken, body.Password); err != nil {
		if errors.Is(err, service.ErrInvalidResetToken) {
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
		}
		if errors.Is(err, service.ErrWeakPassword) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// RequestMePasswordVerificationCode emails a verification code so a signed-in user without 2FA can change password.
func (h *PasswordRecoveryHandler) RequestMePasswordVerificationCode(c *fiber.Ctx) error {
	if h.svc == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "password verification email is not available")
	}
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	if err := h.svc.RequestVerificationCodeSignedIn(c.Context(), uid); err != nil {
		switch {
		case errors.Is(err, service.ErrPasswordChangeUsesTOTP):
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrMailNotConfigured):
			return fiber.NewError(fiber.StatusServiceUnavailable, err.Error())
		case errors.Is(err, service.ErrPasswordChangeRateLimited):
			return fiber.NewError(fiber.StatusTooManyRequests, err.Error())
		case errors.Is(err, repository.ErrUserNotFound):
			return fiber.NewError(fiber.StatusNotFound, err.Error())
		default:
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
	}
	return c.JSON(fiber.Map{
		"ok":      true,
		"message": "If email delivery is working, check your inbox for a 6-digit code.",
	})
}

// MeChangePasswordBody is the logged-in password change confirmation (totp XOR email code).
type MeChangePasswordBody struct {
	Password   string `json:"password"`
	TotpCode   string `json:"totp_code"`
	EmailCode  string `json:"email_code"`
}

// ChangeMePassword sets a new password after verifying TOTP (2FA) or an emailed code (otherwise). Revokes all sessions.
func (h *PasswordRecoveryHandler) ChangeMePassword(c *fiber.Ctx) error {
	if h.svc == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "password change is not available")
	}
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body MeChangePasswordBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.svc.ChangePasswordSignedIn(c.Context(), uid, body.Password, body.TotpCode, body.EmailCode); err != nil {
		switch {
		case errors.Is(err, service.ErrWeakPassword):
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrInvalidTOTP):
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
		case errors.Is(err, service.ErrInvalidRecoveryCode):
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
		case errors.Is(err, service.ErrPasswordWrongProofKind):
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		case errors.Is(err, repository.ErrUserNotFound):
			return fiber.NewError(fiber.StatusNotFound, err.Error())
		default:
			var inv *validation.InvalidInputError
			if errors.As(err, &inv) {
				return fiber.NewError(fiber.StatusBadRequest, inv.Message)
			}
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *PasswordRecoveryHandler) verifyTurnstile(c *fiber.Ctx, token string) error {
	if !h.turnstileEnabled || h.turnstileSecretKey == "" {
		return nil
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return fiber.NewError(fiber.StatusBadRequest, "turnstile verification required")
	}
	if len(token) > 4096 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid turnstile token")
	}
	ctx, cancel := context.WithTimeout(c.Context(), 12*time.Second)
	defer cancel()
	if err := turnstile.Verify(ctx, nil, h.turnstileSecretKey, token, c.IP()); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "turnstile verification failed")
	}
	return nil
}
