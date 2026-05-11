package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
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
	ErrInvalidCredentials  = errors.New("invalid email or password")
	ErrWeakPassword        = errors.New("password must be at least 8 characters")
	ErrInvalidEmail        = errors.New("invalid email address")
	ErrInvalidTOTP         = errors.New("invalid two-factor code")
	ErrInvalidPending      = errors.New("invalid or expired login token")
	ErrTwoFactorAlreadyOn  = errors.New("two-factor authentication is already enabled")
	ErrUsernameImmutable   = errors.New("username cannot be changed")
	ErrInvalidBetaKey      = errors.New("invalid beta access key")
	ErrBetaKeyClaimed      = errors.New("beta access key already claimed")
	ErrBetaUnlockRequired  = errors.New("complete beta access unlock before registering")
	ErrBetaKeyClaimInvalid = errors.New("beta access key is invalid or no longer available")
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

type AuthService struct {
	users              repository.UserRepository
	sessions           repository.SessionRepository
	betaKeys           repository.BetaKeyRepository
	pool               *pgxpool.Pool
	betaAccessRequired bool
	jwtSecret          []byte
	sessionTTL         time.Duration
}

func NewAuthService(
	pool *pgxpool.Pool,
	users repository.UserRepository,
	sessions repository.SessionRepository,
	betaKeys repository.BetaKeyRepository,
	jwtSecret string,
	sessionMaxAgeSeconds int,
	betaAccessRequired bool,
) *AuthService {
	if sessionMaxAgeSeconds < 300 {
		sessionMaxAgeSeconds = 30 * 24 * 3600
	}
	if betaAccessRequired && (pool == nil || betaKeys == nil) {
		panic("NewAuthService: beta access requires non-nil pool and BetaKeyRepository")
	}
	return &AuthService{
		users:              users,
		sessions:           sessions,
		betaKeys:           betaKeys,
		pool:               pool,
		betaAccessRequired: betaAccessRequired,
		jwtSecret:          []byte(jwtSecret),
		sessionTTL:         time.Duration(sessionMaxAgeSeconds) * time.Second,
	}
}

// BetaKeyHash returns the SHA-256 hex digest of the trimmed UTF-8 key (matches DB key_hash).
func BetaKeyHash(plaintext string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(plaintext)))
	return hex.EncodeToString(sum[:])
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

func (s *AuthService) Register(ctx context.Context, email, password, displayName, usernamePreferred string, claimKeyID *uuid.UUID) (*models.User, string, error) {
	if s.betaAccessRequired {
		if claimKeyID == nil || *claimKeyID == uuid.Nil {
			return nil, "", ErrBetaUnlockRequired
		}
		return s.registerWithBetaPostUnlock(ctx, email, password, displayName, usernamePreferred, *claimKeyID)
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
	return u, raw, nil
}

func (s *AuthService) registerWithBetaPostUnlock(ctx context.Context, email, password, displayName, usernamePreferred string, claimKeyID uuid.UUID) (*models.User, string, error) {
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

	if err := s.betaKeys.LockClaimedKeyTx(ctx, tx, claimKeyID); err != nil {
		if errors.Is(err, repository.ErrBetaKeyNotFound) {
			return nil, "", ErrBetaKeyClaimInvalid
		}
		return nil, "", err
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
	if err := s.betaKeys.DeleteClaimedKeyTx(ctx, tx, claimKeyID); err != nil {
		return nil, "", ErrBetaKeyClaimInvalid
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
	return u, rawTok, nil
}

// ClaimBetaKeyForUnlock marks the key claimed in the database and returns its id for the unlock cookie.
func (s *AuthService) ClaimBetaKeyForUnlock(ctx context.Context, rawKey string) (uuid.UUID, error) {
	if s.betaKeys == nil {
		return uuid.Nil, errors.New("beta keys not configured")
	}
	rawKey = strings.TrimSpace(rawKey)
	if len(rawKey) < 8 || len(rawKey) > 512 {
		return uuid.Nil, ErrInvalidBetaKey
	}
	id, err := s.betaKeys.ClaimBetaKeyByHash(ctx, BetaKeyHash(rawKey))
	if err != nil {
		if errors.Is(err, repository.ErrBetaKeyNotFound) {
			return uuid.Nil, ErrInvalidBetaKey
		}
		if errors.Is(err, repository.ErrBetaKeyAlreadyClaimed) {
			return uuid.Nil, ErrBetaKeyClaimed
		}
		return uuid.Nil, err
	}
	return id, nil
}

// SignBetaUnlockToken issues a short-lived cookie value after a key was claimed at unlock.
func (s *AuthService) SignBetaUnlockToken(keyID uuid.UUID) (string, error) {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"typ": betaUnlockTyp,
		"kid": keyID.String(),
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	})
	return tok.SignedString(s.jwtSecret)
}

// ParseBetaUnlockToken returns the beta_keys id from a signed unlock cookie.
func (s *AuthService) ParseBetaUnlockToken(tokenStr string) (uuid.UUID, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !tok.Valid {
		return uuid.Nil, ErrInvalidPending
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return uuid.Nil, ErrInvalidPending
	}
	if typ, _ := claims["typ"].(string); typ != betaUnlockTyp {
		return uuid.Nil, ErrInvalidPending
	}
	kid, _ := claims["kid"].(string)
	keyID, err := uuid.Parse(kid)
	if err != nil || keyID == uuid.Nil {
		return uuid.Nil, ErrInvalidPending
	}
	return keyID, nil
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
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
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
	return s.sessions.FindUserByValidToken(ctx, h)
}

func (s *AuthService) GetProfile(ctx context.Context, userID int64) (*models.User, error) {
	return s.users.GetByID(ctx, userID)
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
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(b[:])
	return raw, hashSessionToken(raw), nil
}

func hashSessionToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
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
