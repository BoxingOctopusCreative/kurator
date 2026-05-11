package handler

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/middleware"
	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/boxingoctopus/kurator/api/internal/turnstile"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/gofiber/fiber/v2"
)

type AuthHandler struct {
	auth               *service.AuthService
	cookieSecure       bool
	sessionMaxAgeSec   int
	betaUnlockMaxAge   int
	turnstileEnabled   bool
	turnstileSecretKey string
	betaAccessRequired bool
	publicWebBaseURL   string
}

func NewAuthHandler(auth *service.AuthService, cookieSecure bool, sessionMaxAgeSec int, turnstileEnabled bool, turnstileSecretKey string, betaAccessRequired bool, publicWebBaseURL string) *AuthHandler {
	return &AuthHandler{
		auth:               auth,
		cookieSecure:       cookieSecure,
		sessionMaxAgeSec:   sessionMaxAgeSec,
		betaUnlockMaxAge:   7 * 24 * 3600,
		turnstileEnabled:   turnstileEnabled,
		turnstileSecretKey: strings.TrimSpace(turnstileSecretKey),
		betaAccessRequired: betaAccessRequired,
		publicWebBaseURL:   strings.TrimRight(strings.TrimSpace(publicWebBaseURL), "/"),
	}
}

// RegisterBody is the JSON body for POST /api/v1/auth/register.
type RegisterBody struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	DisplayName    string `json:"display_name"`
	Username       string `json:"username"`
	TurnstileToken string `json:"turnstile_token"`
}

// Register creates an account and sets the session cookie.
// @Summary Register
// @Tags auth
// @Accept json
// @Produce json
// @Param body body RegisterBody true "Account"
// @Success 201 {object} models.User
// @Failure 400 {object} map[string]string
// @Failure 409 {object} map[string]string "email already registered"
// @Router /api/v1/auth/register [post]
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var body RegisterBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.verifyTurnstile(c, body.TurnstileToken); err != nil {
		return err
	}
	var proof *service.BetaRegisterProof
	if h.betaAccessRequired {
		raw := c.Cookies(middleware.BetaUnlockCookieName)
		if raw == "" {
			return fiber.NewError(fiber.StatusForbidden, service.ErrBetaUnlockRequired.Error())
		}
		bc, err := h.auth.ParseBetaUnlockCookie(raw)
		if err != nil {
			return fiber.NewError(fiber.StatusForbidden, service.ErrBetaUnlockRequired.Error())
		}
		proof = &service.BetaRegisterProof{KeyID: bc.KeyID, InviteID: bc.InviteID}
	}
	u, raw, err := h.auth.Register(c.Context(), body.Email, body.Password, body.DisplayName, body.Username, proof)
	if err != nil {
		if errors.Is(err, repository.ErrUsernameTaken) {
			return fiber.NewError(fiber.StatusConflict, "username already taken")
		}
		if errors.Is(err, repository.ErrEmailTaken) {
			return fiber.NewError(fiber.StatusConflict, "email already registered")
		}
		if errors.Is(err, service.ErrWeakPassword) || errors.Is(err, service.ErrInvalidEmail) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		if errors.Is(err, service.ErrBetaUnlockRequired) {
			return fiber.NewError(fiber.StatusForbidden, err.Error())
		}
		if errors.Is(err, service.ErrBetaKeyClaimInvalid) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		if errors.Is(err, service.ErrBetaInviteEmailMismatch) {
			return fiber.NewError(fiber.StatusConflict, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	h.setSessionCookie(c, raw)
	if h.betaAccessRequired {
		h.clearBetaUnlockCookie(c)
	}
	return c.Status(fiber.StatusCreated).JSON(publicUser(u))
}

// BetaAccessStatus reports whether private beta enforcement is on and whether this browser has completed unlock.
// @Summary Beta access status
// @Tags auth
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/auth/beta/status [get]
func (h *AuthHandler) BetaAccessStatus(c *fiber.Ctx) error {
	if !h.betaAccessRequired {
		return c.JSON(fiber.Map{"required": false, "unlocked": true})
	}
	raw := c.Cookies(middleware.BetaUnlockCookieName)
	if raw == "" {
		return c.JSON(fiber.Map{"required": true, "unlocked": false})
	}
	if _, err := h.auth.ParseBetaUnlockCookie(raw); err != nil {
		return c.JSON(fiber.Map{"required": true, "unlocked": false})
	}
	return c.JSON(fiber.Map{"required": true, "unlocked": true})
}

// BetaRequestAccessBody is the JSON body for POST /api/v1/auth/beta/request-access.
type BetaRequestAccessBody struct {
	Email          string `json:"email"`
	TurnstileToken string `json:"turnstile_token"`
}

// BetaRequestAccess queues a beta invite for the given email and notifies the admin when mail is configured.
// @Router /api/v1/auth/beta/request-access [post]
func (h *AuthHandler) BetaRequestAccess(c *fiber.Ctx) error {
	if !h.betaAccessRequired {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	var body BetaRequestAccessBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.verifyTurnstile(c, body.TurnstileToken); err != nil {
		return err
	}
	em, err := validation.Email(body.Email, "Email")
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if err := h.auth.RequestBetaAccess(c.Context(), em); err != nil {
		if errors.Is(err, service.ErrInvalidEmail) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{
		"ok":      true,
		"message": "If this address is eligible for the beta, you will hear from us by email.",
	})
}

// BetaApproveAccess approves a pending request from the emailed admin link.
// @Router /api/v1/auth/beta/approve-access [get]
func (h *AuthHandler) BetaApproveAccess(c *fiber.Ctx) error {
	if !h.betaAccessRequired {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	tok := strings.TrimSpace(c.Query("t"))
	if tok == "" {
		return c.Status(fiber.StatusBadRequest).Type("html").SendString(betaAdminResultPage(false))
	}
	if err := h.auth.ApproveBetaAccessFromAdminToken(c.Context(), tok); err != nil {
		return c.Status(fiber.StatusBadRequest).Type("html").SendString(betaAdminResultPage(false))
	}
	return c.Type("html").SendString(betaAdminResultPage(true))
}

func betaAdminResultPage(ok bool) string {
	if ok {
		return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kurator beta</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.5"><p>Access approved. The requester has been emailed a link to create their account.</p></body></html>`
	}
	return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kurator beta</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.5"><p>This approval link is invalid or has already been used.</p></body></html>`
}

// BetaOpenInvite sets the beta unlock cookie and redirects to registration.
// @Router /api/v1/auth/beta/open-invite [get]
func (h *AuthHandler) BetaOpenInvite(c *fiber.Ctx) error {
	if !h.betaAccessRequired {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	tok := strings.TrimSpace(c.Query("t"))
	regURL := "/register"
	if h.publicWebBaseURL != "" {
		regURL = h.publicWebBaseURL + "/register"
	}
	if tok == "" {
		return c.Redirect(regURL+"?beta_error=invite", fiber.StatusFound)
	}
	jwtVal, err := h.auth.OpenBetaInviteFromUserToken(c.Context(), tok)
	if err != nil {
		return c.Redirect(regURL+"?beta_error=invite", fiber.StatusFound)
	}
	h.setBetaUnlockCookie(c, jwtVal)
	return c.Redirect(regURL, fiber.StatusFound)
}

// BetaUnlockBody is the JSON body for POST /api/v1/auth/beta/unlock.
type BetaUnlockBody struct {
	Key string `json:"key"`
}

// BetaUnlock validates a beta key and sets the kurator_beta_unlock cookie.
// @Summary Unlock private beta (set cookie)
// @Tags auth
// @Accept json
// @Produce json
// @Param body body BetaUnlockBody true "Beta access key"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/auth/beta/unlock [post]
func (h *AuthHandler) BetaUnlock(c *fiber.Ctx) error {
	if !h.betaAccessRequired {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	var body BetaUnlockBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	keyID, err := h.auth.ClaimBetaKeyForUnlock(c.Context(), body.Key)
	if err != nil {
		if errors.Is(err, service.ErrInvalidBetaKey) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		if errors.Is(err, service.ErrBetaKeyClaimed) {
			return fiber.NewError(fiber.StatusConflict, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	tok, err := h.auth.SignBetaUnlockToken(keyID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	h.setBetaUnlockCookie(c, tok)
	return c.JSON(fiber.Map{"ok": true})
}

// LoginBody is the JSON body for POST /api/v1/auth/login.
type LoginBody struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstile_token"`
}

// Login starts a session or returns a pending 2FA token.
// @Summary Login
// @Tags auth
// @Accept json
// @Produce json
// @Param body body LoginBody true "Credentials"
// @Success 200 {object} map[string]interface{} "two_factor_required, pending_token, or user"
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/v1/auth/login [post]
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var body LoginBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.verifyTurnstile(c, body.TurnstileToken); err != nil {
		return err
	}
	res, err := h.auth.Login(c.Context(), body.Email, body.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if res.Pending2FAToken != "" {
		return c.JSON(fiber.Map{
			"two_factor_required": true,
			"pending_token":       res.Pending2FAToken,
		})
	}
	h.setSessionCookie(c, res.RawSessionToken)
	return c.JSON(fiber.Map{"two_factor_required": false, "user": publicUser(res.User)})
}

// Login2FABody completes login after password step when 2FA is enabled.
type Login2FABody struct {
	PendingToken string `json:"pending_token"`
	Code         string `json:"code"`
}

// Login2FA completes login with TOTP after Login returned two_factor_required.
// @Summary Login (2FA)
// @Tags auth
// @Accept json
// @Produce json
// @Param body body Login2FABody true "Pending token and TOTP"
// @Success 200 {object} map[string]interface{} "user object; session cookie set"
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/auth/login/2fa [post]
func (h *AuthHandler) Login2FA(c *fiber.Ctx) error {
	var body Login2FABody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	u, raw, err := h.auth.CompleteLogin2FA(c.Context(), strings.TrimSpace(body.PendingToken), body.Code)
	if err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		if errors.Is(err, service.ErrInvalidTOTP) || errors.Is(err, service.ErrInvalidPending) {
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	h.setSessionCookie(c, raw)
	return c.JSON(fiber.Map{"user": publicUser(u)})
}

// Logout invalidates the session and clears the cookie.
// @Summary Logout
// @Tags auth
// @Success 204
// @Router /api/v1/auth/logout [post]
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	raw := c.Cookies(middleware.SessionCookieName)
	_ = h.auth.Logout(c.Context(), raw)
	h.clearSessionCookie(c)
	return c.SendStatus(fiber.StatusNoContent)
}

// Me returns the signed-in user's profile.
// @Summary Current user
// @Tags auth
// @Security SessionCookie
// @Produce json
// @Success 200 {object} models.User
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/v1/me [get]
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	u, err := h.auth.GetProfile(c.Context(), uid)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "user not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(publicUser(u))
}

// PatchMeBody is the JSON body for PATCH /api/v1/me.
type PatchMeBody struct {
	DisplayName     *string          `json:"display_name"`
	Bio             *string          `json:"bio"`
	AvatarURL       *string          `json:"avatar_url"`
	BannerURL       *string          `json:"banner_url"`
	FirstName       *string          `json:"first_name"`
	LastName        *string          `json:"last_name"`
	FirstNamePublic *bool            `json:"first_name_public"`
	LastNamePublic  *bool            `json:"last_name_public"`
	Location        *string          `json:"location"`
	SocialLinks     *json.RawMessage `json:"social_links"`
	Username        *string          `json:"username"`
	ProfileIsPublic *bool            `json:"profile_is_public"`
	ThemePreference *string          `json:"theme_preference"`
	ColorScheme     *string          `json:"color_scheme"`
	// AccessibleColorSchemesEnabled opts in to extra palettes designed for colour-vision accessibility.
	AccessibleColorSchemesEnabled *bool   `json:"accessible_color_schemes_enabled"`
	FontFamily                    *string `json:"font_family"`
	AccessibleFontsEnabled        *bool   `json:"accessible_fonts_enabled"`
}

// PatchMe updates profile fields for the signed-in user.
// @Summary Update profile
// @Tags auth
// @Security SessionCookie
// @Accept json
// @Produce json
// @Param body body PatchMeBody true "Fields to update"
// @Success 200 {object} models.User
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/me [patch]
func (h *AuthHandler) PatchMe(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body PatchMeBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	u, err := h.auth.GetProfile(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	dn := u.DisplayName
	if body.DisplayName != nil {
		dn = strings.TrimSpace(*body.DisplayName)
	}
	bio := u.Bio
	if body.Bio != nil {
		bio = strings.TrimSpace(*body.Bio)
	}
	var av *string
	if body.AvatarURL != nil {
		t := strings.TrimSpace(*body.AvatarURL)
		if t == "" {
			av = nil
		} else {
			av = &t
		}
	} else {
		av = u.AvatarURL
	}
	var bn *string
	if body.BannerURL != nil {
		t := strings.TrimSpace(*body.BannerURL)
		if t == "" {
			bn = nil
		} else {
			bn = &t
		}
	} else {
		bn = u.BannerURL
	}
	fn := u.FirstName
	if body.FirstName != nil {
		fn = strings.TrimSpace(*body.FirstName)
	}
	ln := u.LastName
	if body.LastName != nil {
		ln = strings.TrimSpace(*body.LastName)
	}
	fnPub := u.FirstNamePublic
	if body.FirstNamePublic != nil {
		fnPub = *body.FirstNamePublic
	}
	lnPub := u.LastNamePublic
	if body.LastNamePublic != nil {
		lnPub = *body.LastNamePublic
	}
	loc := u.Location
	if body.Location != nil {
		loc = strings.TrimSpace(*body.Location)
	}
	socialRaw := []byte(u.SocialLinks)
	if body.SocialLinks != nil {
		socialRaw = *body.SocialLinks
	}
	un := u.Username
	if body.Username != nil {
		un = strings.TrimSpace(*body.Username)
	}
	profilePublic := u.ProfileIsPublic
	if body.ProfileIsPublic != nil {
		profilePublic = *body.ProfileIsPublic
	}
	if body.ThemePreference != nil {
		if err := h.auth.UpdateThemePreference(c.Context(), uid, *body.ThemePreference); err != nil {
			var inv *validation.InvalidInputError
			if errors.As(err, &inv) {
				return fiber.NewError(fiber.StatusBadRequest, inv.Message)
			}
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	if body.ColorScheme != nil || body.AccessibleColorSchemesEnabled != nil {
		if err := h.auth.UpdateColorPreferences(c.Context(), uid, body.ColorScheme, body.AccessibleColorSchemesEnabled); err != nil {
			var inv *validation.InvalidInputError
			if errors.As(err, &inv) {
				return fiber.NewError(fiber.StatusBadRequest, inv.Message)
			}
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	if body.FontFamily != nil || body.AccessibleFontsEnabled != nil {
		if err := h.auth.UpdateFontPreferences(c.Context(), uid, body.FontFamily, body.AccessibleFontsEnabled); err != nil {
			var inv *validation.InvalidInputError
			if errors.As(err, &inv) {
				return fiber.NewError(fiber.StatusBadRequest, inv.Message)
			}
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	if err := h.auth.UpdateProfile(c.Context(), uid, dn, bio, av, bn, fn, ln, loc, fnPub, lnPub, socialRaw, un, profilePublic); err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		if errors.Is(err, repository.ErrUsernameTaken) {
			return fiber.NewError(fiber.StatusConflict, "username already taken")
		}
		if errors.Is(err, service.ErrUsernameImmutable) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	u2, err := h.auth.GetProfile(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(publicUser(u2))
}

// TwoFASetup returns a new TOTP secret and otpauth URL for enrollment.
// @Summary Start 2FA setup
// @Tags auth
// @Security SessionCookie
// @Produce json
// @Success 200 {object} service.TwoFASetupResult
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/me/2fa/setup [post]
func (h *AuthHandler) TwoFASetup(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	out, err := h.auth.SetupTwoFactor(c.Context(), uid)
	if err != nil {
		if errors.Is(err, service.ErrTwoFactorAlreadyOn) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(out)
}

// TwoFAEnableBody confirms enrollment with a TOTP code.
type TwoFAEnableBody struct {
	Code string `json:"code"`
}

// TwoFAEnable turns on 2FA after TwoFASetup.
// @Summary Enable 2FA
// @Tags auth
// @Security SessionCookie
// @Accept json
// @Produce json
// @Param body body TwoFAEnableBody true "TOTP from authenticator app"
// @Success 200 {object} models.User
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/me/2fa/enable [post]
func (h *AuthHandler) TwoFAEnable(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body TwoFAEnableBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.auth.EnableTwoFactor(c.Context(), uid, body.Code); err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		if errors.Is(err, service.ErrInvalidTOTP) {
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
		}
		if errors.Is(err, service.ErrTwoFactorAlreadyOn) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	u, err := h.auth.GetProfile(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(publicUser(u))
}

// TwoFADisableBody confirms password before disabling 2FA.
type TwoFADisableBody struct {
	Password string `json:"password"`
}

// TwoFADisable turns off 2FA after verifying the account password.
// @Summary Disable 2FA
// @Tags auth
// @Security SessionCookie
// @Accept json
// @Produce json
// @Param body body TwoFADisableBody true "Account password"
// @Success 200 {object} models.User
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/v1/me/2fa/disable [post]
func (h *AuthHandler) TwoFADisable(c *fiber.Ctx) error {
	uid, err := localUserID(c)
	if err != nil {
		return err
	}
	var body TwoFADisableBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.auth.DisableTwoFactor(c.Context(), uid, body.Password); err != nil {
		var inv *validation.InvalidInputError
		if errors.As(err, &inv) {
			return fiber.NewError(fiber.StatusBadRequest, inv.Message)
		}
		if errors.Is(err, service.ErrInvalidCredentials) {
			return fiber.NewError(fiber.StatusUnauthorized, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	u, err := h.auth.GetProfile(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(publicUser(u))
}

func (h *AuthHandler) verifyTurnstile(c *fiber.Ctx, token string) error {
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

func localUserID(c *fiber.Ctx) (int64, error) {
	v := c.Locals("userID")
	if v == nil {
		return 0, fiber.ErrUnauthorized
	}
	id, ok := v.(int64)
	if !ok {
		return 0, fiber.ErrUnauthorized
	}
	return id, nil
}

func publicUser(u *models.User) fiber.Map {
	m := fiber.Map{
		"id":                               u.ID,
		"email":                            u.Email,
		"username":                         u.Username,
		"username_locked":                  u.UsernameLocked,
		"profile_is_public":                u.ProfileIsPublic,
		"display_name":                     u.DisplayName,
		"first_name":                       u.FirstName,
		"last_name":                        u.LastName,
		"first_name_public":                u.FirstNamePublic,
		"last_name_public":                 u.LastNamePublic,
		"location":                         u.Location,
		"bio":                              u.Bio,
		"social_links":                     socialLinksForResponse(u.SocialLinks),
		"theme_preference":                 u.ThemePreference,
		"color_scheme":                     u.ColorScheme,
		"accessible_color_schemes_enabled": u.AccessibleColorSchemesEnabled,
		"font_family":                      u.FontFamily,
		"accessible_fonts_enabled":         u.AccessibleFontsEnabled,
		"two_factor_enabled":               u.TwoFactorEnabled,
		"created_at":                       u.CreatedAt,
		"updated_at":                       u.UpdatedAt,
	}
	if u.AvatarURL != nil {
		m["avatar_url"] = *u.AvatarURL
	} else {
		m["avatar_url"] = nil
	}
	if u.BannerURL != nil {
		m["banner_url"] = *u.BannerURL
	} else {
		m["banner_url"] = nil
	}
	return m
}

func socialLinksForResponse(raw json.RawMessage) interface{} {
	if len(raw) == 0 {
		return []interface{}{}
	}
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return []interface{}{}
	}
	return v
}

func (h *AuthHandler) setSessionCookie(c *fiber.Ctx, raw string) {
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

func (h *AuthHandler) clearSessionCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    "",
		Path:     "/",
		HTTPOnly: true,
		SameSite: "Lax",
		Secure:   h.cookieSecure,
		MaxAge:   -1,
	})
}

func (h *AuthHandler) setBetaUnlockCookie(c *fiber.Ctx, raw string) {
	c.Cookie(&fiber.Cookie{
		Name:     middleware.BetaUnlockCookieName,
		Value:    raw,
		Path:     "/",
		HTTPOnly: true,
		SameSite: "Lax",
		Secure:   h.cookieSecure,
		MaxAge:   h.betaUnlockMaxAge,
	})
}

func (h *AuthHandler) clearBetaUnlockCookie(c *fiber.Ctx) {
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
