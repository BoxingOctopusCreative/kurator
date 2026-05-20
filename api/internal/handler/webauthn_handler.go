package handler

import (
	"encoding/json"
	"errors"

	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type WebAuthnHandler struct {
	webauthn         *service.WebAuthnService
	cookieSecure     bool
	sessionMaxAgeSec int
}

func NewWebAuthnHandler(webauthn *service.WebAuthnService, cookieSecure bool, sessionMaxAgeSec int) *WebAuthnHandler {
	return &WebAuthnHandler{
		webauthn:         webauthn,
		cookieSecure:     cookieSecure,
		sessionMaxAgeSec: sessionMaxAgeSec,
	}
}

// WebAuthnStatus reports whether passkey sign-in is available.
// @Summary Passkey availability
// @Tags auth
// @Produce json
// @Success 200 {object} map[string]bool
// @Router /api/v1/auth/webauthn/status [get]
func (h *WebAuthnHandler) Status(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"enabled": h.webauthn != nil && h.webauthn.Enabled()})
}

type webAuthnLoginBeginBody struct {
	Email string `json:"email"`
}

// LoginBegin starts a passkey authentication ceremony.
// @Summary Begin passkey login
// @Tags auth
// @Accept json
// @Produce json
// @Param body body webAuthnLoginBeginBody false "Optional email to scope credentials"
// @Success 200 {object} service.WebAuthnBeginResult
// @Failure 400 {object} map[string]string
// @Router /api/v1/auth/webauthn/login/begin [post]
func (h *WebAuthnHandler) LoginBegin(c *fiber.Ctx) error {
	var body webAuthnLoginBeginBody
	_ = c.BodyParser(&body)
	res, err := h.webauthn.BeginLogin(c.Context(), body.Email)
	if err != nil {
		return h.mapCeremonyError(err)
	}
	return c.JSON(res)
}

type webAuthnFinishBody struct {
	SessionToken string          `json:"session_token"`
	Credential   json.RawMessage `json:"credential"`
}

// LoginFinish completes passkey login and sets the session cookie.
// @Summary Finish passkey login
// @Tags auth
// @Accept json
// @Produce json
// @Param body body webAuthnFinishBody true "Ceremony token and authenticator response"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/auth/webauthn/login/finish [post]
func (h *WebAuthnHandler) LoginFinish(c *fiber.Ctx) error {
	var body webAuthnFinishBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if body.SessionToken == "" || len(body.Credential) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "session_token and credential are required")
	}
	res, err := h.webauthn.FinishLogin(c.Context(), body.SessionToken, body.Credential)
	if err != nil {
		if errors.Is(err, service.ErrAccountDeactivated) {
			return fiber.NewError(fiber.StatusForbidden, err.Error())
		}
		return h.mapCeremonyError(err)
	}
	h.setSessionCookie(c, res.RawSessionToken)
	return c.JSON(fiber.Map{
		"user":          publicUser(res.User),
		"session_token": res.RawSessionToken,
	})
}

// ListMyCredentials lists passkeys for the signed-in user.
// @Summary List passkeys
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {array} service.WebAuthnCredentialView
// @Failure 401 {object} map[string]string
// @Router /api/v1/me/webauthn/credentials [get]
func (h *WebAuthnHandler) ListMyCredentials(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	list, err := h.webauthn.ListCredentials(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if list == nil {
		list = []service.WebAuthnCredentialView{}
	}
	return c.JSON(list)
}

type webAuthnRegisterBeginBody struct {
	Nickname string `json:"nickname"`
}

// RegisterBegin starts registering a new passkey for the signed-in user.
// @Summary Begin passkey registration
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body webAuthnRegisterBeginBody false "Optional label"
// @Success 200 {object} service.WebAuthnBeginResult
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/me/webauthn/register/begin [post]
func (h *WebAuthnHandler) RegisterBegin(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body webAuthnRegisterBeginBody
	_ = c.BodyParser(&body)
	res, err := h.webauthn.BeginRegistration(c.Context(), uid, body.Nickname)
	if err != nil {
		return h.mapCeremonyError(err)
	}
	return c.JSON(res)
}

type webAuthnRegisterFinishBody struct {
	SessionToken string          `json:"session_token"`
	Credential   json.RawMessage `json:"credential"`
	Nickname     string          `json:"nickname"`
}

// RegisterFinish stores a new passkey for the signed-in user.
// @Summary Finish passkey registration
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param body body webAuthnRegisterFinishBody true "Ceremony token and attestation"
// @Success 201 {object} service.WebAuthnCredentialView
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /api/v1/me/webauthn/register/finish [post]
func (h *WebAuthnHandler) RegisterFinish(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body webAuthnRegisterFinishBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if body.SessionToken == "" || len(body.Credential) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "session_token and credential are required")
	}
	view, err := h.webauthn.FinishRegistration(c.Context(), uid, body.SessionToken, body.Credential, body.Nickname)
	if err != nil {
		if errors.Is(err, service.ErrWebAuthnCredentialExists) {
			return fiber.NewError(fiber.StatusConflict, err.Error())
		}
		return h.mapCeremonyError(err)
	}
	return c.Status(fiber.StatusCreated).JSON(view)
}

type webAuthnRenameBody struct {
	Nickname string `json:"nickname"`
}

// RenameCredential updates a passkey label.
// @Summary Rename passkey
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Accept json
// @Produce json
// @Param id path int true "Credential ID"
// @Param body body webAuthnRenameBody true "New label"
// @Success 204
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/me/webauthn/credentials/{id} [patch]
func (h *WebAuthnHandler) RenameCredential(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	id, err := c.ParamsInt("id")
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid credential id")
	}
	var body webAuthnRenameBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.webauthn.RenameCredential(c.Context(), uid, int64(id), body.Nickname); err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		return fiber.NewError(fiber.StatusNotFound, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// DeleteCredential removes a passkey.
// @Summary Delete passkey
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Param id path int true "Credential ID"
// @Success 204
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/me/webauthn/credentials/{id} [delete]
func (h *WebAuthnHandler) DeleteCredential(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	id, err := c.ParamsInt("id")
	if err != nil || id < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid credential id")
	}
	if err := h.webauthn.DeleteCredential(c.Context(), uid, int64(id)); err != nil {
		if errors.Is(err, service.ErrWebAuthnLastAuthMethod) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusNotFound, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *WebAuthnHandler) setSessionCookie(c *fiber.Ctx, raw string) {
	c.Cookie(&fiber.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    raw,
		Path:     "/",
		HTTPOnly: true,
		Secure:   h.cookieSecure,
		SameSite: "Lax",
		MaxAge:   h.sessionMaxAgeSec,
	})
}

func (h *WebAuthnHandler) mapCeremonyError(err error) error {
	if errors.Is(err, service.ErrWebAuthnDisabled) {
		return fiber.NewError(fiber.StatusServiceUnavailable, err.Error())
	}
	if errors.Is(err, service.ErrWebAuthnNoCredentials) {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if errors.Is(err, service.ErrWebAuthnInvalidCeremony) {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	var inv *validation.InvalidInputError
	if errors.As(err, &inv) {
		return fiber.NewError(fiber.StatusBadRequest, inv.Message)
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return fiber.NewError(fiber.StatusBadRequest, "passkey ceremony failed")
}
