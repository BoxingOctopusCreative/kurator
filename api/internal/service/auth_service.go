package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/notifyqueue"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

const twoFAPendingTyp = "2fa_pending"
const betaUnlockTyp = "beta_unlock"

var (
	ErrInvalidCredentials      = errors.New("invalid email or password")
	ErrWeakPassword            = errors.New("password must be at least 8 characters")
	ErrInvalidEmail            = errors.New("invalid email address")
	ErrInvalidTOTP             = errors.New("invalid two-factor code")
	ErrInvalidPending          = errors.New("invalid or expired login token")
	ErrTwoFactorAlreadyOn      = errors.New("two-factor authentication is already enabled")
	ErrUsernameImmutable       = errors.New("username cannot be changed")
	ErrBetaUnlockRequired      = errors.New("complete beta access unlock before registering")
	ErrBetaInviteInvalid       = errors.New("beta invite is invalid or no longer available")
	ErrBetaInviteEmailMismatch = errors.New("register using the same email address you requested beta access with")
	ErrAccountDeactivated      = errors.New("this account has been deactivated")
)

type LoginStep1Result struct {
	User            *models.User
	RawSessionToken string
	Pending2FAToken string
}

type TwoFASetupResult struct {
	Secret     string `json:"secret"`
	OtpauthURL string `json:"otpauth_url"`
}

// BetaUnlockCookie describes a valid kurator_beta_unlock JWT after an approved email invite link.
type BetaUnlockCookie struct {
	InviteID *uuid.UUID
}

// BetaRegisterProof is the approved email invite consumed at registration.
type BetaRegisterProof struct {
	InviteID *uuid.UUID
}

type AuthService struct {
	users              repository.UserRepository
	sessions           repository.SessionRepository
	betaInvites        repository.BetaAccessInviteRepository
	collections        *repository.PostgresCollectionRepository
	publicWebBaseURL   string
	pool               *pgxpool.Pool
	betaAccessRequired bool
	jwtSecret          []byte
	sessionTTL         time.Duration
	notify             *notifyqueue.Client
}

func NewAuthService(
	pool *pgxpool.Pool,
	users repository.UserRepository,
	sessions repository.SessionRepository,
	betaInvites repository.BetaAccessInviteRepository,
	collections *repository.PostgresCollectionRepository,
	publicWebBaseURL string,
	jwtSecret string,
	sessionMaxAgeSeconds int,
	betaAccessRequired bool,
	notify *notifyqueue.Client,
) *AuthService {
	if sessionMaxAgeSeconds < 300 {
		sessionMaxAgeSeconds = 30 * 24 * 3600
	}
	if betaAccessRequired && (pool == nil || betaInvites == nil) {
		panic("NewAuthService: beta access requires non-nil pool and BetaAccessInviteRepository")
	}
	return &AuthService{
		users:              users,
		sessions:           sessions,
		betaInvites:        betaInvites,
		collections:        collections,
		publicWebBaseURL:   strings.TrimRight(strings.TrimSpace(publicWebBaseURL), "/"),
		pool:               pool,
		betaAccessRequired: betaAccessRequired,
		jwtSecret:          []byte(jwtSecret),
		sessionTTL:         time.Duration(sessionMaxAgeSeconds) * time.Second,
		notify:             notify,
	}
}

func (s *AuthService) notifyUserRegistered(_ context.Context, u *models.User) {
	if s.notify == nil || u == nil {
		return
	}
	bg, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.notify.EnqueueUserRegistered(bg, u.ID, u.Email); err != nil {
		log.Printf("user_registered: enqueue failed: %v", err)
	}
}

// OnAccountCreated provisions a starter shelf and enqueues post-registration hooks.
func (s *AuthService) OnAccountCreated(ctx context.Context, u *models.User) {
	if u == nil {
		return
	}
	if err := ProvisionNewUser(ctx, s.collections, u.ID); err != nil {
		log.Printf("provision new user %d: %v", u.ID, err)
	}
	s.notifyUserRegistered(ctx, u)
}

func registerUsernameCandidates(preferred, email string) ([]string, error) {
	var out []string
	seen := map[string]struct{}{}
	add := func(validated string) {
		if _, ok := seen[validated]; ok {
			return
		}
		seen[validated] = struct{}{}
		out = append(out, validated)
	}
	if strings.TrimSpace(preferred) != "" {
		u, err := validation.Username(strings.TrimSpace(preferred))
		if err != nil {
			return nil, err
		}
		add(u)
	}
	base := validation.SuggestUsernameBase(email)
	if u, err := validation.Username(base); err == nil {
		add(u)
	}
	if u, err := validation.Username("collector"); err == nil {
		add(u)
	}
	prefix := base
	if len(prefix) > 20 {
		prefix = prefix[:20]
		prefix = strings.TrimRight(prefix, "_-")
	}
	if prefix == "" {
		prefix = "user"
	}
	for i := 2; i < 80; i++ {
		suf := fmt.Sprintf("%d", i)
		p := prefix
		if len(p)+len(suf) > 30 {
			p = p[:30-len(suf)]
			p = strings.TrimRight(p, "_-")
		}
		if len(p) < 1 {
			p = "u"
		}
		if u, err := validation.Username(p + suf); err == nil {
			add(u)
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no username candidates")
	}
	return out, nil
}

func (s *AuthService) Register(ctx context.Context, email, password, displayName, usernamePreferred string, proof *BetaRegisterProof) (*models.User, string, error) {
	if s.betaAccessRequired {
		if proof == nil || proof.InviteID == nil || *proof.InviteID == uuid.Nil {
			return nil, "", ErrBetaUnlockRequired
		}
		return s.registerWithBetaInvite(ctx, email, password, displayName, usernamePreferred, *proof.InviteID)
	}

	em, err := validation.Email(email, "Email")
	if err != nil {
		return nil, "", ErrInvalidEmail
	}
	email = em
	if len(password) < 8 {
		return nil, "", ErrWeakPassword
	}
	if err := validation.Password(password, "Password"); err != nil {
		return nil, "", err
	}
	ph, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return nil, "", err
	}
	dn := strings.TrimSpace(displayName)
	if dn == "" {
		dn = deriveDisplayName(email)
	} else {
		dn, err = validation.StrictPlainText(dn, validation.MaxName, "Display name", false)
		if err != nil {
			return nil, "", err
		}
	}
	candidates, err := registerUsernameCandidates(usernamePreferred, email)
	if err != nil {
		return nil, "", err
	}
	var u *models.User
	for _, cand := range candidates {
		u, err = s.users.Create(ctx, email, string(ph), dn, cand)
		if err == nil {
			break
		}
		if errors.Is(err, repository.ErrEmailTaken) {
			return nil, "", err
		}
		if errors.Is(err, repository.ErrUsernameTaken) {
			continue
		}
		return nil, "", err
	}
	if u == nil {
		return nil, "", repository.ErrUsernameTaken
	}
	raw, h, err := s.newSessionToken()
	if err != nil {
		return nil, "", err
	}
	exp := time.Now().Add(s.sessionTTL)
	if err := s.sessions.Create(ctx, u.ID, h, exp); err != nil {
		return nil, "", err
	}
	s.OnAccountCreated(ctx, u)
	return u, raw, nil
}

func (s *AuthService) registerWithBetaInvite(ctx context.Context, email, password, displayName, usernamePreferred string, inviteID uuid.UUID) (*models.User, string, error) {
	em, err := validation.Email(email, "Email")
	if err != nil {
		return nil, "", ErrInvalidEmail
	}
	email = em
	if len(password) < 8 {
		return nil, "", ErrWeakPassword
	}
	if err := validation.Password(password, "Password"); err != nil {
		return nil, "", err
	}
	ph, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return nil, "", err
	}
	dn := strings.TrimSpace(displayName)
	if dn == "" {
		dn = deriveDisplayName(email)
	} else {
		dn, err = validation.StrictPlainText(dn, validation.MaxName, "Display name", false)
		if err != nil {
			return nil, "", err
		}
	}
	candidates, err := registerUsernameCandidates(usernamePreferred, email)
	if err != nil {
		return nil, "", err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	allowedEmail, err := s.betaInvites.LockApprovedForRegistrationTx(ctx, tx, inviteID)
	if err != nil {
		if errors.Is(err, repository.ErrBetaInviteNotFound) {
			return nil, "", ErrBetaInviteInvalid
		}
		return nil, "", err
	}
	if !strings.EqualFold(strings.TrimSpace(allowedEmail), email) {
		return nil, "", ErrBetaInviteEmailMismatch
	}

	var u *models.User
	for _, cand := range candidates {
		u, err = s.users.CreateTx(ctx, tx, email, string(ph), dn, cand)
		if err == nil {
			break
		}
		if errors.Is(err, repository.ErrEmailTaken) {
			return nil, "", err
		}
		if errors.Is(err, repository.ErrUsernameTaken) {
			continue
		}
		return nil, "", err
	}
	if u == nil {
		return nil, "", repository.ErrUsernameTaken
	}
	if err := s.betaInvites.MarkConsumedTx(ctx, tx, inviteID); err != nil {
		return nil, "", ErrBetaInviteInvalid
	}
	rawTok, h, err := s.newSessionToken()
	if err != nil {
		return nil, "", err
	}
	exp := time.Now().Add(s.sessionTTL)
	if err := s.sessions.CreateTx(ctx, tx, u.ID, h, exp); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, "", err
	}
	s.OnAccountCreated(ctx, u)
	return u, rawTok, nil
}

// SignBetaUnlockInviteToken issues a cookie value after the user opened an approved invite link.
func (s *AuthService) SignBetaUnlockInviteToken(inviteID uuid.UUID) (string, error) {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"typ": betaUnlockTyp,
		"iid": inviteID.String(),
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	})
	return tok.SignedString(s.jwtSecret)
}

// ParseBetaUnlockCookie returns invite-based unlock claims from the kurator_beta_unlock cookie.
func (s *AuthService) ParseBetaUnlockCookie(tokenStr string) (*BetaUnlockCookie, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !tok.Valid {
		return nil, ErrInvalidPending
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrInvalidPending
	}
	if typ, _ := claims["typ"].(string); typ != betaUnlockTyp {
		return nil, ErrInvalidPending
	}
	iidStr, _ := claims["iid"].(string)
	invID, err := uuid.Parse(strings.TrimSpace(iidStr))
	if err != nil || invID == uuid.Nil {
		return nil, ErrInvalidPending
	}
	return &BetaUnlockCookie{InviteID: &invID}, nil
}

func tokenHashHex(raw string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(raw)))
	return hex.EncodeToString(sum[:])
}

func randomURLToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

// RequestBetaAccess notifies the configured admin (Discord webhook or email) with an approve link.
func (s *AuthService) RequestBetaAccess(ctx context.Context, requesterEmail string) error {
	em, err := validation.Email(requesterEmail, "Email")
	if err != nil {
		return ErrInvalidEmail
	}
	if s.betaInvites == nil {
		return errors.New("beta invites not configured")
	}
	adminTok, err := randomURLToken()
	if err != nil {
		return err
	}
	adminHash := tokenHashHex(adminTok)
	if _, err := s.betaInvites.ReplacePendingInvite(ctx, em, adminHash); err != nil {
		return err
	}
	if s.publicWebBaseURL == "" {
		log.Printf("beta access request: invite queued for %q (no public_web_base_url configured)", em)
		return nil
	}
	approveURL := fmt.Sprintf("%s/api/v1/auth/beta/approve-access?t=%s", s.publicWebBaseURL, adminTok)
	log.Printf("beta access request: invite queued for %q, approve_url=%s", em, approveURL)

	if s.notify != nil {
		bg, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.notify.EnqueueBetaAccessRequest(bg, em, approveURL); err != nil {
			log.Printf("beta access request: enqueue notification failed: %v", err)
		}
	}
	return nil
}

// ApproveBetaAccessFromAdminToken marks the request approved and emails the requester an unlock link.
func (s *AuthService) ApproveBetaAccessFromAdminToken(ctx context.Context, adminToken string) error {
	if s.betaInvites == nil {
		return errors.New("beta invites not configured")
	}
	h := tokenHashHex(adminToken)
	id, requester, err := s.betaInvites.FindPendingByAdminTokenHash(ctx, h)
	if err != nil {
		if errors.Is(err, repository.ErrBetaInviteNotFound) {
			return ErrInvalidPending
		}
		return err
	}
	userTok, err := randomURLToken()
	if err != nil {
		return err
	}
	userHash := tokenHashHex(userTok)
	exp := time.Now().Add(14 * 24 * time.Hour)
	if err := s.betaInvites.ApprovePending(ctx, id, userHash, exp); err != nil {
		return err
	}
	if s.publicWebBaseURL == "" {
		return nil
	}
	openURL := fmt.Sprintf("%s/api/v1/auth/beta/open-invite?t=%s", s.publicWebBaseURL, userTok)
	if s.notify != nil {
		bg, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.notify.EnqueueBetaAccessApproved(bg, requester, openURL); err != nil {
			log.Printf("beta access approve: enqueue notification failed: %v", err)
		}
	}
	return nil
}

// OpenBetaInviteFromUserToken validates a post-approval token and returns a signed cookie value for kurator_beta_unlock.
func (s *AuthService) OpenBetaInviteFromUserToken(ctx context.Context, userToken string) (cookieJWT string, err error) {
	if s.betaInvites == nil {
		return "", errors.New("beta invites not configured")
	}
	h := tokenHashHex(userToken)
	id, _, _, err := s.betaInvites.FindApprovedByUserTokenHash(ctx, h)
	if err != nil {
		if errors.Is(err, repository.ErrBetaInviteNotFound) {
			return "", ErrInvalidPending
		}
		return "", err
	}
	return s.SignBetaUnlockInviteToken(id)
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*LoginStep1Result, error) {
	em, err := validation.Email(email, "Email")
	if err != nil {
		return nil, ErrInvalidCredentials
	}
	email = em
	u, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}
	if !models.HasPassword(u) {
		return nil, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}
	if u.AccountStatus == models.AccountStatusDeactivated {
		return nil, ErrAccountDeactivated
	}
	if u.TwoFactorEnabled && u.TwoFactorSecret != nil && strings.TrimSpace(*u.TwoFactorSecret) != "" {
		tok, err := s.signPending2FA(u.ID)
		if err != nil {
			return nil, err
		}
		return &LoginStep1Result{User: u, Pending2FAToken: tok}, nil
	}
	raw, h, err := s.newSessionToken()
	if err != nil {
		return nil, err
	}
	exp := time.Now().Add(s.sessionTTL)
	if err := s.sessions.Create(ctx, u.ID, h, exp); err != nil {
		return nil, err
	}
	return &LoginStep1Result{User: u, RawSessionToken: raw}, nil
}

func (s *AuthService) CompleteLogin2FA(ctx context.Context, pendingToken, code string) (*models.User, string, error) {
	if _, err := validation.PendingLoginToken(pendingToken, "Session"); err != nil {
		return nil, "", err
	}
	codeNorm, err := validation.TotpCode(code, "Code")
	if err != nil {
		return nil, "", err
	}
	uid, err := s.parsePending2FA(pendingToken)
	if err != nil {
		return nil, "", err
	}
	u, err := s.users.GetByID(ctx, uid)
	if err != nil {
		return nil, "", ErrInvalidPending
	}
	if !u.TwoFactorEnabled || u.TwoFactorSecret == nil || strings.TrimSpace(*u.TwoFactorSecret) == "" {
		return nil, "", ErrInvalidPending
	}
	if !totp.Validate(codeNorm, strings.TrimSpace(*u.TwoFactorSecret)) {
		return nil, "", ErrInvalidTOTP
	}
	if u.AccountStatus == models.AccountStatusDeactivated {
		return nil, "", ErrAccountDeactivated
	}
	raw, h, err := s.newSessionToken()
	if err != nil {
		return nil, "", err
	}
	exp := time.Now().Add(s.sessionTTL)
	if err := s.sessions.Create(ctx, u.ID, h, exp); err != nil {
		return nil, "", err
	}
	return u, raw, nil
}

func (s *AuthService) Logout(ctx context.Context, rawSessionToken string) error {
	if rawSessionToken == "" {
		return nil
	}
	h := hashSessionToken(rawSessionToken)
	return s.sessions.DeleteByTokenHash(ctx, h)
}

func (s *AuthService) UserIDFromSession(ctx context.Context, rawSessionToken string) (int64, error) {
	if rawSessionToken == "" {
		return 0, repository.ErrSessionInvalid
	}
	h := hashSessionToken(rawSessionToken)
	uid, err := s.sessions.FindUserByValidToken(ctx, h)
	if err != nil {
		return 0, err
	}
	u, err := s.users.GetByID(ctx, uid)
	if err != nil {
		return 0, repository.ErrSessionInvalid
	}
	if u.AccountStatus == models.AccountStatusDeactivated {
		return 0, repository.ErrSessionInvalid
	}
	return uid, nil
}

func (s *AuthService) GetProfile(ctx context.Context, userID int64) (*models.User, error) {
	return s.users.GetByID(ctx, userID)
}

func (s *AuthService) UserHasAnyShelves(ctx context.Context, userID int64) (bool, error) {
	return s.users.UserHasAnyShelves(ctx, userID)
}

func (s *AuthService) UpdateProfile(ctx context.Context, userID int64, displayName, bio string, avatarURL, bannerURL *string, firstName, lastName, location string, firstNamePublic, lastNamePublic bool, socialLinks []byte, username string, profileIsPublic bool) error {
	cur, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	dn, err := validation.ProfileDisplayName(displayName)
	if err != nil {
		return err
	}
	b, err := validation.ProfileBio(bio)
	if err != nil {
		return err
	}
	fn, err := validation.ProfileFirstName(firstName)
	if err != nil {
		return err
	}
	ln, err := validation.ProfileLastName(lastName)
	if err != nil {
		return err
	}
	loc, err := validation.ProfileLocation(location)
	if err != nil {
		return err
	}
	sl, err := validation.SocialLinksJSON(socialLinks)
	if err != nil {
		return err
	}
	un, err := validation.Username(username)
	if err != nil {
		return err
	}
	if un != cur.Username && cur.UsernameLocked {
		return ErrUsernameImmutable
	}
	otherID, err := s.users.GetIDByUsernameCI(ctx, un)
	if err == nil && otherID != userID {
		return repository.ErrUsernameTaken
	}
	if err != nil && !errors.Is(err, repository.ErrUserNotFound) {
		return err
	}
	var av *string
	if avatarURL != nil {
		t, err := validation.OptionalHTTPURL(*avatarURL, "Avatar URL")
		if err != nil {
			return err
		}
		if t == "" {
			av = nil
		} else {
			av = &t
		}
	}
	var bn *string
	if bannerURL != nil {
		t, err := validation.OptionalHTTPURL(*bannerURL, "Banner URL")
		if err != nil {
			return err
		}
		if t == "" {
			bn = nil
		} else {
			bn = &t
		}
	}
	setUsernameLocked := !cur.UsernameLocked && un != cur.Username
	return s.users.UpdateProfile(ctx, userID, dn, b, av, bn, fn, ln, loc, firstNamePublic, lastNamePublic, sl, un, profileIsPublic, setUsernameLocked)
}

func (s *AuthService) UpdateThemePreference(ctx context.Context, userID int64, raw string) error {
	pref, err := validation.ThemePreference(raw)
	if err != nil {
		return err
	}
	return s.users.UpdateThemePreference(ctx, userID, pref)
}

// UpdateFontPreferences updates UI font id and/or accessible-reading-font opt-in. Pass nil to leave unchanged.
func (s *AuthService) UpdateFontPreferences(ctx context.Context, userID int64, fontFamily *string, accessibleEnabled *bool) error {
	if fontFamily == nil && accessibleEnabled == nil {
		return nil
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	acc := u.AccessibleFontsEnabled
	if accessibleEnabled != nil {
		acc = *accessibleEnabled
	}
	ff := u.FontFamily
	if ff == "" {
		ff = validation.FontFamilyDefault
	}
	if !acc && validation.IsAccessibleFontFamily(ff) {
		ff = validation.FontFamilyDefault
	}
	if fontFamily != nil {
		norm, err := validation.FontFamily(strings.TrimSpace(*fontFamily), acc)
		if err != nil {
			return err
		}
		ff = norm
	}
	return s.users.UpdateFontPreferences(ctx, userID, ff, acc)
}

// UpdateColorPreferences updates palette and/or accessible-palette opt-in. Pass nil for fields that should not change.
func (s *AuthService) UpdateColorPreferences(ctx context.Context, userID int64, colorScheme *string, accessibleEnabled *bool) error {
	if colorScheme == nil && accessibleEnabled == nil {
		return nil
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	acc := u.AccessibleColorSchemesEnabled
	if accessibleEnabled != nil {
		acc = *accessibleEnabled
	}
	scheme := u.ColorScheme
	if scheme == "" {
		scheme = validation.ColorSchemeDefault
	}
	if !acc && validation.IsAccessibleColorScheme(scheme) {
		scheme = validation.ColorSchemeDefault
	}
	if colorScheme != nil {
		norm, err := validation.ColorScheme(strings.TrimSpace(*colorScheme), acc)
		if err != nil {
			return err
		}
		scheme = norm
	}
	return s.users.UpdateColorPreferences(ctx, userID, scheme, acc)
}

func (s *AuthService) VerifyPassword(ctx context.Context, userID int64, password string) error {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if !models.HasPassword(u) {
		return ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return ErrInvalidCredentials
	}
	return nil
}

func (s *AuthService) SetupTwoFactor(ctx context.Context, userID int64) (*TwoFASetupResult, error) {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.TwoFactorEnabled {
		return nil, ErrTwoFactorAlreadyOn
	}
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Kurator",
		AccountName: u.Email,
	})
	if err != nil {
		return nil, err
	}
	if err := s.users.SetTwoFactorPending(ctx, userID, key.Secret()); err != nil {
		return nil, err
	}
	return &TwoFASetupResult{Secret: key.Secret(), OtpauthURL: key.URL()}, nil
}

func (s *AuthService) EnableTwoFactor(ctx context.Context, userID int64, code string) error {
	codeNorm, err := validation.TotpCode(code, "Code")
	if err != nil {
		return err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if u.TwoFactorSecret == nil || strings.TrimSpace(*u.TwoFactorSecret) == "" {
		return errors.New("call two-factor setup first")
	}
	if u.TwoFactorEnabled {
		return ErrTwoFactorAlreadyOn
	}
	if !totp.Validate(codeNorm, strings.TrimSpace(*u.TwoFactorSecret)) {
		return ErrInvalidTOTP
	}
	return s.users.EnableTwoFactor(ctx, userID)
}

func (s *AuthService) DisableTwoFactor(ctx context.Context, userID int64, password string) error {
	if err := validation.Password(password, "Password"); err != nil {
		return err
	}
	if err := s.VerifyPassword(ctx, userID, password); err != nil {
		return err
	}
	return s.users.DisableTwoFactor(ctx, userID)
}

func (s *AuthService) newSessionToken() (raw string, hash string, err error) {
	return newSessionTokenPair()
}

func (s *AuthService) signPending2FA(userID int64) (string, error) {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"typ": twoFAPendingTyp,
		"sub": fmt.Sprintf("%d", userID),
		"exp": time.Now().Add(5 * time.Minute).Unix(),
	})
	return tok.SignedString(s.jwtSecret)
}

func (s *AuthService) parsePending2FA(tokenStr string) (int64, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !tok.Valid {
		return 0, ErrInvalidPending
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return 0, ErrInvalidPending
	}
	if typ, _ := claims["typ"].(string); typ != twoFAPendingTyp {
		return 0, ErrInvalidPending
	}
	sub, _ := claims["sub"].(string)
	var uid int64
	if _, err := fmt.Sscanf(sub, "%d", &uid); err != nil || uid < 1 {
		return 0, ErrInvalidPending
	}
	return uid, nil
}

func deriveDisplayName(email string) string {
	at := strings.IndexByte(email, '@')
	if at <= 0 {
		return "Collector"
	}
	return email[:at]
}
