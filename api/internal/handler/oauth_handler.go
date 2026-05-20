package handler

import (
	"errors"
	"net/url"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type OAuthHandler struct {
	oauth              *service.OAuthService
	auth               *service.AuthService
	cookieSecure       bool
	sessionMaxAgeSec   int
	betaAccessRequired bool
	publicWebBaseURL   string
}

func NewOAuthHandler(
	oauth *service.OAuthService,
	auth *service.AuthService,
	cookieSecure bool,
	sessionMaxAgeSec int,
	betaAccessRequired bool,
	publicWebBaseURL string,
) *OAuthHandler {
	return &OAuthHandler{
		oauth:              oauth,
		auth:               auth,
		cookieSecure:       cookieSecure,
		sessionMaxAgeSec:   sessionMaxAgeSec,
		betaAccessRequired: betaAccessRequired,
		publicWebBaseURL:   strings.TrimRight(strings.TrimSpace(publicWebBaseURL), "/"),
	}
}

// ListProviders returns configured OAuth providers for the sign-in UI.
// @Summary List OAuth providers
// @Tags auth
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/auth/oauth/providers [get]
func (h *OAuthHandler) ListProviders(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"providers": h.oauth.EnabledProviders()})
}

// ListMyIdentities returns providers linked to the signed-in account.
// @Summary List linked OAuth providers
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/me/oauth/identities [get]
func (h *OAuthHandler) ListMyIdentities(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	idents, err := h.oauth.ListLinkedIdentities(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"identities": idents})
}

// Start redirects the browser to the OAuth provider authorization page.
// @Summary Start OAuth sign-in
// @Tags auth
// @Param provider path string true "google or discord"
// @Param next query string false "Relative path after success (default /)"
// @Success 302
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/auth/oauth/{provider} [get]
func (h *OAuthHandler) Start(c *fiber.Ctx) error {
	provider := strings.ToLower(strings.TrimSpace(c.Params("provider")))
	next := c.Query("next", "/")
	var betaInviteID *uuid.UUID
	if h.betaAccessRequired && h.auth != nil {
		raw := c.Cookies(middleware.BetaUnlockCookieName)
		if raw != "" {
			if bc, err := h.auth.ParseBetaUnlockCookie(raw); err == nil && bc.InviteID != nil {
				betaInviteID = bc.InviteID
			}
		}
	}
	state, err := h.oauth.SignStateLogin(provider, next, betaInviteID)
	if err != nil {
		if errors.Is(err, service.ErrOAuthProviderUnknown) || errors.Is(err, service.ErrOAuthProviderDisabled) {
			return fiber.NewError(fiber.StatusNotFound, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	authURL, err := h.oauth.AuthCodeURL(provider, state)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Redirect(authURL, fiber.StatusFound)
}

// StartLink redirects an authenticated user to link a provider to their account.
// @Summary Start OAuth account link
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Param provider path string true "google or discord"
// @Param next query string false "Relative path after success (default /settings/app)"
// @Success 302
// @Router /api/v1/me/oauth/{provider}/link [get]
func (h *OAuthHandler) StartLink(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	provider := strings.ToLower(strings.TrimSpace(c.Params("provider")))
	next := c.Query("next", "/settings/app")
	state, err := h.oauth.SignStateLink(provider, next, uid)
	if err != nil {
		if errors.Is(err, service.ErrOAuthProviderUnknown) || errors.Is(err, service.ErrOAuthProviderDisabled) {
			return fiber.NewError(fiber.StatusNotFound, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	authURL, err := h.oauth.AuthCodeURL(provider, state)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Redirect(authURL, fiber.StatusFound)
}

// Callback completes OAuth sign-in or account linking and redirects back to the web app.
// @Summary OAuth callback
// @Tags auth
// @Param provider path string true "google or discord"
// @Param state query string true "Signed state from Start"
// @Param code query string true "Authorization code"
// @Success 302
// @Router /api/v1/auth/oauth/{provider}/callback [get]
func (h *OAuthHandler) Callback(c *fiber.Ctx) error {
	provider := strings.ToLower(strings.TrimSpace(c.Params("provider")))
	if errParam := strings.TrimSpace(c.Query("error")); errParam != "" {
		return c.Redirect(h.oauthFailureURL("failed", false), fiber.StatusFound)
	}
	state := strings.TrimSpace(c.Query("state"))
	code := strings.TrimSpace(c.Query("code"))
	if state == "" || code == "" {
		return c.Redirect(h.oauthFailureURL("invalid_state", false), fiber.StatusFound)
	}
	var sessionUID *int64
	if raw := middleware.SessionRawFromRequest(c); raw != "" && h.auth != nil {
		if uid, err := h.auth.UserIDFromSession(c.Context(), raw); err == nil && uid > 0 {
			sessionUID = &uid
		}
	}
	res, st, err := h.oauth.CompleteCallback(c.Context(), provider, state, code, sessionUID)
	if err != nil {
		linkMode := st != nil && st.Mode == service.OAuthStateModeLink
		return c.Redirect(h.oauthFailureURL(oauthErrorParam(err), linkMode), fiber.StatusFound)
	}
	if res.LinkedProvider != "" {
		return c.Redirect(h.oauthLinkSuccessURL(st.Next, res.LinkedProvider), fiber.StatusFound)
	}
	h.setSessionCookie(c, res.RawSessionToken)
	if h.betaAccessRequired && res.IsNewUser {
		h.clearBetaUnlockCookie(c)
	}
	dest := h.publicWebBaseURL + st.Next
	return c.Redirect(dest, fiber.StatusFound)
}

// Unlink removes a linked provider from the signed-in account.
// @Summary Unlink OAuth provider
// @Tags auth
// @Security SessionCookie
// @Security BearerToken
// @Param provider path string true "google or discord"
// @Success 204
// @Failure 400 {object} map[string]string
// @Router /api/v1/me/oauth/{provider} [delete]
func (h *OAuthHandler) Unlink(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	provider := strings.ToLower(strings.TrimSpace(c.Params("provider")))
	if err := h.oauth.UnlinkProvider(c.Context(), uid, provider); err != nil {
		if errors.Is(err, service.ErrOAuthProviderUnknown) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		if errors.Is(err, service.ErrOAuthLastAuthMethod) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		if errors.Is(err, repository.ErrOAuthIdentityNotFound) {
			return c.SendStatus(fiber.StatusNoContent)
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func oauthErrorParam(err error) string {
	switch {
	case errors.Is(err, service.ErrOAuthEmailRequired):
		return "email_required"
	case errors.Is(err, service.ErrOAuthEmailPasswordExists):
		return "password_account"
	case errors.Is(err, service.ErrOAuthAccountExists):
		return "account_exists"
	case errors.Is(err, service.ErrOAuthRegisterDisabledInBeta):
		return "beta_oauth_register_disabled"
	case errors.Is(err, service.ErrOAuthProviderLinkedElsewhere):
		return "provider_linked_elsewhere"
	case errors.Is(err, service.ErrOAuthProviderAlreadyLinked):
		return "provider_already_linked"
	case errors.Is(err, service.ErrOAuthLastAuthMethod):
		return "last_auth_method"
	case errors.Is(err, service.ErrBetaUnlockRequired):
		return "beta_required"
	case errors.Is(err, service.ErrBetaInviteInvalid):
		return "beta_invite_invalid"
	case errors.Is(err, service.ErrBetaInviteEmailMismatch):
		return "beta_email_mismatch"
	case errors.Is(err, service.ErrAccountDeactivated):
		return "account_deactivated"
	case errors.Is(err, service.ErrOAuthStateInvalid):
		return "invalid_state"
	default:
		return "failed"
	}
}

func (h *OAuthHandler) oauthFailureURL(code string, linkFlow bool) string {
	q := url.Values{}
	if linkFlow {
		q.Set("oauth_link_error", code)
		return h.publicWebBaseURL + "/settings/app?" + q.Encode()
	}
	q.Set("oauth_error", code)
	return h.publicWebBaseURL + "/login?" + q.Encode()
}

func (h *OAuthHandler) oauthLinkSuccessURL(next, provider string) string {
	dest := sanitizeSettingsReturn(next)
	q := url.Values{}
	q.Set("oauth_linked", provider)
	return h.publicWebBaseURL + dest + "?" + q.Encode()
}

func sanitizeSettingsReturn(next string) string {
	next = strings.TrimSpace(next)
	if strings.HasPrefix(next, "/settings") {
		return next
	}
	return "/settings/app"
}

func (h *OAuthHandler) setSessionCookie(c *fiber.Ctx, raw string) {
	c.Cookie(&fiber.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    raw,
		Path:     "/",
		HTTPOnly: true,
		SameSite: "Lax",
		Secure:   h.cookieSecure,
		MaxAge:   h.sessionMaxAgeSec,
	})
}

func (h *OAuthHandler) clearBetaUnlockCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     middleware.BetaUnlockCookieName,
		Value:    "",
		Path:     "/",
		HTTPOnly: true,
		SameSite: "Lax",
		Secure:   h.cookieSecure,
		MaxAge:   -1,
	})
}
