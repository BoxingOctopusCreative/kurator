package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrWebAuthnDisabled         = errors.New("passkeys are not configured")
	ErrWebAuthnNoCredentials    = errors.New("no passkeys registered for this account")
	ErrWebAuthnInvalidCeremony  = errors.New("invalid or expired passkey ceremony")
	ErrWebAuthnLastAuthMethod   = errors.New("add a password or linked sign-in provider before removing your only passkey")
	ErrWebAuthnCredentialExists = errors.New("this passkey is already registered")
)

const webauthnSessionJWTTyp = "webauthn_session"

// WebAuthnBeginResult is returned from begin registration/login ceremonies.
type WebAuthnBeginResult struct {
	SessionToken string      `json:"session_token"`
	PublicKey    interface{} `json:"publicKey"`
}

// WebAuthnLoginResult completes a passkey sign-in.
type WebAuthnLoginResult struct {
	User            *models.User
	RawSessionToken string
}

// WebAuthnCredentialView is a passkey row for the settings UI.
type WebAuthnCredentialView struct {
	ID         int64      `json:"id"`
	Nickname   string     `json:"nickname"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

type WebAuthnService struct {
	web            *webauthn.WebAuthn
	enabled        bool
	users          repository.UserRepository
	creds          repository.WebAuthnCredentialRepository
	oauth          repository.OAuthIdentityRepository
	sessions       repository.SessionRepository
	jwtSecret      []byte
	sessionTTL     time.Duration
}

type WebAuthnServiceConfig struct {
	PublicWebBaseURL string
	CORSOrigins      []string
	RPDisplayName    string
	JWTSecret        string
	SessionMaxAgeSec int
}

func NewWebAuthnService(
	users repository.UserRepository,
	creds repository.WebAuthnCredentialRepository,
	oauth repository.OAuthIdentityRepository,
	sessions repository.SessionRepository,
	cfg WebAuthnServiceConfig,
) (*WebAuthnService, error) {
	rpID, origins := resolveWebAuthnRP(cfg.PublicWebBaseURL, cfg.CORSOrigins)
	if rpID == "" || len(origins) == 0 {
		return &WebAuthnService{enabled: false, users: users, creds: creds, oauth: oauth, sessions: sessions}, nil
	}
	display := strings.TrimSpace(cfg.RPDisplayName)
	if display == "" {
		display = "Kurator"
	}
	w, err := webauthn.New(&webauthn.Config{
		RPID:          rpID,
		RPDisplayName: display,
		RPOrigins:     origins,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementPreferred,
			UserVerification: protocol.VerificationPreferred,
		},
		Timeouts: webauthn.TimeoutsConfig{
			Registration: webauthn.TimeoutConfig{Enforce: true, Timeout: 5 * time.Minute},
			Login:        webauthn.TimeoutConfig{Enforce: true, Timeout: 5 * time.Minute},
		},
	})
	if err != nil {
		return nil, err
	}
	ttl := time.Duration(cfg.SessionMaxAgeSec) * time.Second
	if ttl <= 0 {
		ttl = 30 * 24 * time.Hour
	}
	return &WebAuthnService{
		web:        w,
		enabled:    true,
		users:      users,
		creds:      creds,
		oauth:      oauth,
		sessions:   sessions,
		jwtSecret:  []byte(strings.TrimSpace(cfg.JWTSecret)),
		sessionTTL: ttl,
	}, nil
}

func (s *WebAuthnService) Enabled() bool {
	return s != nil && s.enabled && s.web != nil
}

func resolveWebAuthnRP(publicWeb string, cors []string) (rpID string, origins []string) {
	seen := map[string]struct{}{}
	add := func(o string) {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		if o == "" {
			return
		}
		if _, ok := seen[o]; ok {
			return
		}
		u, err := url.Parse(o)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return
		}
		seen[o] = struct{}{}
		origins = append(origins, o)
	}
	add(publicWeb)
	for _, o := range cors {
		add(o)
	}
	if len(origins) == 0 {
		return "", nil
	}
	u, err := url.Parse(origins[0])
	if err != nil || u.Hostname() == "" {
		return "", origins
	}
	return u.Hostname(), origins
}

func (s *WebAuthnService) requireEnabled() error {
	if !s.Enabled() {
		return ErrWebAuthnDisabled
	}
	return nil
}

func (s *WebAuthnService) ListCredentials(ctx context.Context, userID int64) ([]WebAuthnCredentialView, error) {
	recs, err := s.creds.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]WebAuthnCredentialView, len(recs))
	for i, rec := range recs {
		out[i] = WebAuthnCredentialView{
			ID:         rec.ID,
			Nickname:   rec.Nickname,
			CreatedAt:  rec.CreatedAt,
			LastUsedAt: rec.LastUsedAt,
		}
	}
	return out, nil
}

func (s *WebAuthnService) BeginRegistration(ctx context.Context, userID int64, nickname string) (*WebAuthnBeginResult, error) {
	if err := s.requireEnabled(); err != nil {
		return nil, err
	}
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		nickname = "Passkey"
	}
	if len(nickname) > 64 {
		return nil, validation.Invalidf("nickname must be at most 64 characters")
	}
	u, recs, err := s.loadAccount(ctx, userID)
	if err != nil {
		return nil, err
	}
	account := newWebAuthnAccount(u, recs)
	creation, session, err := s.web.BeginRegistration(account)
	if err != nil {
		return nil, err
	}
	tok, err := s.signSession(session)
	if err != nil {
		return nil, err
	}
	return &WebAuthnBeginResult{SessionToken: tok, PublicKey: creation.Response}, nil
}

func (s *WebAuthnService) FinishRegistration(ctx context.Context, userID int64, sessionToken string, credentialJSON json.RawMessage, nickname string) (*WebAuthnCredentialView, error) {
	if err := s.requireEnabled(); err != nil {
		return nil, err
	}
	session, err := s.parseSession(sessionToken)
	if err != nil {
		return nil, ErrWebAuthnInvalidCeremony
	}
	u, recs, err := s.loadAccount(ctx, userID)
	if err != nil {
		return nil, err
	}
	account := newWebAuthnAccount(u, recs)
	parsed, err := protocol.ParseCredentialCreationResponseBody(bytes.NewReader(credentialJSON))
	if err != nil {
		return nil, err
	}
	cred, err := s.web.CreateCredential(account, *session, parsed)
	if err != nil {
		return nil, err
	}
	if _, err := s.creds.GetByCredentialID(ctx, cred.ID); err == nil {
		return nil, ErrWebAuthnCredentialExists
	} else if !errors.Is(err, repository.ErrWebAuthnCredentialNotFound) {
		return nil, err
	}
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		nickname = "Passkey"
	}
	rec, err := s.creds.Create(ctx, userID, cred.ID, *cred, nickname)
	if err != nil {
		return nil, err
	}
	return &WebAuthnCredentialView{
		ID:        rec.ID,
		Nickname:  rec.Nickname,
		CreatedAt: rec.CreatedAt,
	}, nil
}

func (s *WebAuthnService) BeginLogin(ctx context.Context, email string) (*WebAuthnBeginResult, error) {
	if err := s.requireEnabled(); err != nil {
		return nil, err
	}
	email = strings.TrimSpace(email)
	if email == "" {
		assertion, session, err := s.web.BeginDiscoverableLogin()
		if err != nil {
			return nil, err
		}
		tok, err := s.signSession(session)
		if err != nil {
			return nil, err
		}
		return &WebAuthnBeginResult{SessionToken: tok, PublicKey: assertion.Response}, nil
	}
	em, err := validation.Email(email, "Email")
	if err != nil {
		return nil, ErrWebAuthnNoCredentials
	}
	u, err := s.users.GetByEmail(ctx, em)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, ErrWebAuthnNoCredentials
		}
		return nil, err
	}
	recs, err := s.creds.ListByUserID(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	if len(recs) == 0 {
		return nil, ErrWebAuthnNoCredentials
	}
	account := newWebAuthnAccount(u, recs)
	assertion, session, err := s.web.BeginLogin(account)
	if err != nil {
		return nil, err
	}
	tok, err := s.signSession(session)
	if err != nil {
		return nil, err
	}
	return &WebAuthnBeginResult{SessionToken: tok, PublicKey: assertion.Response}, nil
}

func (s *WebAuthnService) FinishLogin(ctx context.Context, sessionToken string, credentialJSON json.RawMessage) (*WebAuthnLoginResult, error) {
	if err := s.requireEnabled(); err != nil {
		return nil, err
	}
	session, err := s.parseSession(sessionToken)
	if err != nil {
		return nil, ErrWebAuthnInvalidCeremony
	}
	parsed, err := protocol.ParseCredentialRequestResponseBody(bytes.NewReader(credentialJSON))
	if err != nil {
		return nil, err
	}

	var (
		u    *models.User
		cred *webauthn.Credential
	)

	if len(session.UserID) > 0 {
		uid, err := parseWebAuthnUserIDFromHandle(session.UserID)
		if err != nil {
			return nil, ErrWebAuthnInvalidCeremony
		}
		user, recs, err := s.loadAccount(ctx, uid)
		if err != nil {
			return nil, err
		}
		account := newWebAuthnAccount(user, recs)
		cred, err = s.web.ValidateLogin(account, *session, parsed)
		if err != nil {
			return nil, err
		}
		u = user
	} else {
		handler := func(rawID, userHandle []byte) (webauthn.User, error) {
			stored, err := s.creds.GetByCredentialID(ctx, rawID)
			if err != nil {
				return nil, err
			}
			user, recs, err := s.loadAccount(ctx, stored.UserID)
			if err != nil {
				return nil, err
			}
			if len(userHandle) > 0 {
				uid, err := parseWebAuthnUserIDFromHandle(userHandle)
				if err != nil || uid != stored.UserID {
					return nil, repository.ErrWebAuthnCredentialNotFound
				}
			}
			return newWebAuthnAccount(user, recs), nil
		}
		var account webauthn.User
		account, cred, err = s.web.ValidatePasskeyLogin(handler, *session, parsed)
		if err != nil {
			return nil, err
		}
		uid, err := parseWebAuthnUserIDFromHandle(account.WebAuthnID())
		if err != nil {
			return nil, err
		}
		u, err = s.users.GetByID(ctx, uid)
		if err != nil {
			return nil, err
		}
	}

	if u.AccountStatus == models.AccountStatusDeactivated {
		return nil, ErrAccountDeactivated
	}

	stored, err := s.creds.GetByCredentialID(ctx, cred.ID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	if err := s.creds.UpdateCredential(ctx, stored.ID, *cred, now); err != nil {
		return nil, err
	}

	raw, h, err := newSessionTokenPair()
	if err != nil {
		return nil, err
	}
	exp := time.Now().Add(s.sessionTTL)
	if err := s.sessions.Create(ctx, u.ID, h, exp); err != nil {
		return nil, err
	}
	return &WebAuthnLoginResult{User: u, RawSessionToken: raw}, nil
}

func (s *WebAuthnService) RenameCredential(ctx context.Context, userID, credID int64, nickname string) error {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		return validation.Invalidf("nickname is required")
	}
	if len(nickname) > 64 {
		return validation.Invalidf("nickname must be at most 64 characters")
	}
	return s.creds.UpdateNickname(ctx, credID, userID, nickname)
}

func (s *WebAuthnService) DeleteCredential(ctx context.Context, userID, credID int64) error {
	if err := s.canRemoveCredential(ctx, userID); err != nil {
		return err
	}
	return s.creds.DeleteByIDAndUserID(ctx, credID, userID)
}

func (s *WebAuthnService) canRemoveCredential(ctx context.Context, userID int64) error {
	n, err := s.creds.CountByUserID(ctx, userID)
	if err != nil {
		return err
	}
	if n > 1 {
		return nil
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if models.HasPassword(u) {
		return nil
	}
	oauthN, err := s.oauth.CountByUserID(ctx, userID)
	if err != nil {
		return err
	}
	if oauthN > 0 {
		return nil
	}
	return ErrWebAuthnLastAuthMethod
}

func (s *WebAuthnService) loadAccount(ctx context.Context, userID int64) (*models.User, []repository.WebAuthnCredentialRecord, error) {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	recs, err := s.creds.ListByUserID(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	return u, recs, nil
}

func (s *WebAuthnService) signSession(session *webauthn.SessionData) (string, error) {
	if len(s.jwtSecret) == 0 {
		return "", fmt.Errorf("jwt secret required")
	}
	b, err := json.Marshal(session)
	if err != nil {
		return "", err
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"typ": webauthnSessionJWTTyp,
		"sd":  base64.RawURLEncoding.EncodeToString(b),
		"exp": time.Now().Add(5 * time.Minute).Unix(),
	})
	return tok.SignedString(s.jwtSecret)
}

func (s *WebAuthnService) parseSession(tokenStr string) (*webauthn.SessionData, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !tok.Valid {
		return nil, ErrWebAuthnInvalidCeremony
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrWebAuthnInvalidCeremony
	}
	if typ, _ := claims["typ"].(string); typ != webauthnSessionJWTTyp {
		return nil, ErrWebAuthnInvalidCeremony
	}
	sd, _ := claims["sd"].(string)
	raw, err := base64.RawURLEncoding.DecodeString(sd)
	if err != nil {
		return nil, ErrWebAuthnInvalidCeremony
	}
	var session webauthn.SessionData
	if err := json.Unmarshal(raw, &session); err != nil {
		return nil, ErrWebAuthnInvalidCeremony
	}
	return &session, nil
}
