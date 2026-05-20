package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const oauthStateTyp = "oauth_state"

const (
	OAuthProviderGoogle  = "google"
	OAuthProviderDiscord = "discord"
)

var (
	ErrOAuthProviderUnknown     = errors.New("unknown oauth provider")
	ErrOAuthProviderDisabled    = errors.New("oauth provider is not configured")
	ErrOAuthStateInvalid        = errors.New("invalid or expired oauth state")
	ErrOAuthEmailRequired       = errors.New("oauth provider did not return a verified email")
	ErrOAuthEmailPasswordExists = errors.New("an account with this email already uses a password; log in with email and password")
	ErrOAuthAccountExists            = errors.New("this email is already registered with a different sign-in method")
	ErrOAuthRegisterDisabledInBeta      = errors.New("new accounts cannot be created with Google or Discord during the private beta; use your invite link to register with email")
	ErrOAuthProviderLinkedElsewhere     = errors.New("this Google or Discord account is already linked to another Kurator user")
	ErrOAuthProviderAlreadyLinked       = errors.New("this sign-in method is already linked to your account")
	ErrOAuthLastAuthMethod              = errors.New("set a password or link another sign-in method before removing this one")
)

const (
	oauthModeLogin = "login"
	oauthModeLink  = "link"
)

// OAuthStateModeLink is the JWT state mode for linking a provider to a signed-in account.
const OAuthStateModeLink = oauthModeLink

// OAuthProviderInfo is returned by GET /auth/oauth/providers.
type OAuthProviderInfo struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// OAuthCompleteResult is produced after a successful provider callback.
type OAuthCompleteResult struct {
	User            *models.User
	RawSessionToken string
	IsNewUser       bool
	LinkedProvider  string // set when an existing session linked a provider (no new session token)
}

// LinkedOAuthIdentity is a safe view of a linked provider for GET /me/oauth/identities.
type LinkedOAuthIdentity struct {
	Provider       string    `json:"provider"`
	ProviderEmail  string    `json:"provider_email,omitempty"`
	LinkedAt       time.Time `json:"linked_at"`
}

type OAuthService struct {
	users              repository.UserRepository
	oauthIdentities    repository.OAuthIdentityRepository
	sessions           repository.SessionRepository
	betaInvites        repository.BetaAccessInviteRepository
	pool               *pgxpool.Pool
	betaAccessRequired bool
	jwtSecret          []byte
	sessionTTL         time.Duration
	redirectBaseURL    string
	google             *oauth2.Config
	discord            *oauth2.Config
	httpClient         *http.Client
	auth               *AuthService
}

type OAuthServiceConfig struct {
	RedirectBaseURL      string
	GoogleClientID       string
	GoogleClientSecret   string
	DiscordClientID      string
	DiscordClientSecret  string
	JWTSecret            string
	SessionMaxAgeSeconds int
	BetaAccessRequired   bool
}

func NewOAuthService(
	pool *pgxpool.Pool,
	users repository.UserRepository,
	oauthIdentities repository.OAuthIdentityRepository,
	sessions repository.SessionRepository,
	betaInvites repository.BetaAccessInviteRepository,
	betaAccessRequired bool,
	auth *AuthService,
	cfg OAuthServiceConfig,
) *OAuthService {
	base := strings.TrimRight(strings.TrimSpace(cfg.RedirectBaseURL), "/")
	redirectURL := func(provider string) string {
		return base + "/api/v1/auth/oauth/" + provider + "/callback"
	}
	var googleCfg *oauth2.Config
	if id := strings.TrimSpace(cfg.GoogleClientID); id != "" && strings.TrimSpace(cfg.GoogleClientSecret) != "" {
		googleCfg = &oauth2.Config{
			ClientID:     id,
			ClientSecret: strings.TrimSpace(cfg.GoogleClientSecret),
			RedirectURL:  redirectURL(OAuthProviderGoogle),
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		}
	}
	var discordCfg *oauth2.Config
	if id := strings.TrimSpace(cfg.DiscordClientID); id != "" && strings.TrimSpace(cfg.DiscordClientSecret) != "" {
		discordCfg = &oauth2.Config{
			ClientID:     id,
			ClientSecret: strings.TrimSpace(cfg.DiscordClientSecret),
			RedirectURL:  redirectURL(OAuthProviderDiscord),
			Scopes:       []string{"identify", "email"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://discord.com/api/oauth2/authorize",
				TokenURL: "https://discord.com/api/oauth2/token",
			},
		}
	}
	sessionMax := cfg.SessionMaxAgeSeconds
	if sessionMax < 300 {
		sessionMax = 30 * 24 * 3600
	}
	s := &OAuthService{
		users:              users,
		oauthIdentities:    oauthIdentities,
		sessions:           sessions,
		betaInvites:        betaInvites,
		pool:               pool,
		betaAccessRequired: betaAccessRequired,
		jwtSecret:          []byte(cfg.JWTSecret),
		sessionTTL:         time.Duration(sessionMax) * time.Second,
		redirectBaseURL:    base,
		google:             googleCfg,
		discord:            discordCfg,
		httpClient:         &http.Client{Timeout: 20 * time.Second},
		auth:               auth,
	}
	return s
}

func (s *OAuthService) EnabledProviders() []OAuthProviderInfo {
	out := make([]OAuthProviderInfo, 0, 2)
	if s.google != nil {
		out = append(out, OAuthProviderInfo{ID: OAuthProviderGoogle, Label: "Google"})
	}
	if s.discord != nil {
		out = append(out, OAuthProviderInfo{ID: OAuthProviderDiscord, Label: "Discord"})
	}
	return out
}

func (s *OAuthService) oauthConfig(provider string) (*oauth2.Config, error) {
	switch provider {
	case OAuthProviderGoogle:
		if s.google == nil {
			return nil, ErrOAuthProviderDisabled
		}
		return s.google, nil
	case OAuthProviderDiscord:
		if s.discord == nil {
			return nil, ErrOAuthProviderDisabled
		}
		return s.discord, nil
	default:
		return nil, ErrOAuthProviderUnknown
	}
}

type oauthStateClaims struct {
	Mode       string
	Provider   string
	Next       string
	InviteID   *uuid.UUID
	LinkUserID int64
}

func (s *OAuthService) SignStateLogin(provider, next string, betaInviteID *uuid.UUID) (string, error) {
	return s.signState(provider, next, oauthModeLogin, 0, betaInviteID)
}

func (s *OAuthService) SignStateLink(provider, next string, userID int64) (string, error) {
	if userID < 1 {
		return "", ErrOAuthStateInvalid
	}
	return s.signState(provider, next, oauthModeLink, userID, nil)
}

func (s *OAuthService) signState(provider, next, mode string, linkUserID int64, betaInviteID *uuid.UUID) (string, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if _, err := s.oauthConfig(provider); err != nil {
		return "", err
	}
	next = sanitizeOAuthNext(next)
	if mode == "" {
		mode = oauthModeLogin
	}
	claims := jwt.MapClaims{
		"typ":  oauthStateTyp,
		"mod":  mode,
		"prv":  provider,
		"nxt":  next,
		"exp":  time.Now().Add(15 * time.Minute).Unix(),
	}
	if mode == oauthModeLink {
		claims["uid"] = float64(linkUserID)
	}
	if betaInviteID != nil && *betaInviteID != uuid.Nil {
		claims["iid"] = betaInviteID.String()
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(s.jwtSecret)
}

func (s *OAuthService) ParseState(tokenStr string) (*oauthStateClaims, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !tok.Valid {
		return nil, ErrOAuthStateInvalid
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrOAuthStateInvalid
	}
	if typ, _ := claims["typ"].(string); typ != oauthStateTyp {
		return nil, ErrOAuthStateInvalid
	}
	mod, _ := claims["mod"].(string)
	if mod == "" {
		mod = oauthModeLogin
	}
	prv, _ := claims["prv"].(string)
	nxt, _ := claims["nxt"].(string)
	out := &oauthStateClaims{
		Mode:     mod,
		Provider: strings.ToLower(strings.TrimSpace(prv)),
		Next:     sanitizeOAuthNext(nxt),
	}
	if mod == oauthModeLink {
		switch v := claims["uid"].(type) {
		case float64:
			out.LinkUserID = int64(v)
		case int64:
			out.LinkUserID = v
		}
		if out.LinkUserID < 1 {
			return nil, ErrOAuthStateInvalid
		}
	}
	if iidStr, _ := claims["iid"].(string); strings.TrimSpace(iidStr) != "" {
		invID, err := uuid.Parse(strings.TrimSpace(iidStr))
		if err != nil || invID == uuid.Nil {
			return nil, ErrOAuthStateInvalid
		}
		out.InviteID = &invID
	}
	if _, err := s.oauthConfig(out.Provider); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *OAuthService) AuthCodeURL(provider, state string) (string, error) {
	cfg, err := s.oauthConfig(provider)
	if err != nil {
		return "", err
	}
	if provider == OAuthProviderDiscord {
		return cfg.AuthCodeURL(state, oauth2.AccessTypeOffline), nil
	}
	return cfg.AuthCodeURL(state, oauth2.AccessTypeOffline), nil
}

type oauthUserInfo struct {
	ProviderUserID string
	Email          string
	DisplayName    string
	AvatarURL      *string
}

func (s *OAuthService) CompleteCallback(ctx context.Context, provider, stateToken, code string, sessionUserID *int64) (*OAuthCompleteResult, *oauthStateClaims, error) {
	st, err := s.ParseState(stateToken)
	if err != nil {
		return nil, nil, err
	}
	if st.Provider != strings.ToLower(strings.TrimSpace(provider)) {
		return nil, nil, ErrOAuthStateInvalid
	}
	cfg, err := s.oauthConfig(provider)
	if err != nil {
		return nil, nil, err
	}
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return nil, nil, fmt.Errorf("oauth token exchange: %w", err)
	}
	info, err := s.fetchUserInfo(ctx, provider, tok)
	if err != nil {
		return nil, nil, err
	}
	if st.Mode == oauthModeLink {
		if sessionUserID == nil || *sessionUserID != st.LinkUserID {
			return nil, st, ErrOAuthStateInvalid
		}
		res, err := s.linkProvider(ctx, *sessionUserID, provider, info)
		if err != nil {
			return nil, st, err
		}
		return res, st, nil
	}
	res, err := s.loginOrRegister(ctx, provider, info, st.InviteID)
	if err != nil {
		return nil, st, err
	}
	return res, st, nil
}

func (s *OAuthService) ListLinkedIdentities(ctx context.Context, userID int64) ([]LinkedOAuthIdentity, error) {
	rows, err := s.oauthIdentities.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]LinkedOAuthIdentity, 0, len(rows))
	for _, row := range rows {
		out = append(out, LinkedOAuthIdentity{
			Provider:      row.Provider,
			ProviderEmail: row.ProviderEmail,
			LinkedAt:      row.CreatedAt,
		})
	}
	return out, nil
}

func (s *OAuthService) UnlinkProvider(ctx context.Context, userID int64, provider string) error {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider != OAuthProviderGoogle && provider != OAuthProviderDiscord {
		return ErrOAuthProviderUnknown
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if _, err := s.oauthIdentities.GetByUserAndProvider(ctx, userID, provider); err != nil {
		return err
	}
	hasPassword := models.HasPassword(u)
	n, err := s.oauthIdentities.CountByUserID(ctx, userID)
	if err != nil {
		return err
	}
	if !hasPassword && n <= 1 {
		return ErrOAuthLastAuthMethod
	}
	return s.oauthIdentities.DeleteByUserAndProvider(ctx, userID, provider)
}

func (s *OAuthService) linkProvider(ctx context.Context, userID int64, provider string, info *oauthUserInfo) (*OAuthCompleteResult, error) {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.AccountStatus == models.AccountStatusDeactivated {
		return nil, ErrAccountDeactivated
	}
	if _, err := s.oauthIdentities.GetByUserAndProvider(ctx, userID, provider); err == nil {
		return nil, ErrOAuthProviderAlreadyLinked
	} else if !errors.Is(err, repository.ErrOAuthIdentityNotFound) {
		return nil, err
	}
	existing, err := s.oauthIdentities.GetByProvider(ctx, provider, info.ProviderUserID)
	if err == nil {
		if existing.UserID == userID {
			return &OAuthCompleteResult{User: u, LinkedProvider: provider}, nil
		}
		return nil, ErrOAuthProviderLinkedElsewhere
	}
	if !errors.Is(err, repository.ErrOAuthIdentityNotFound) {
		return nil, err
	}
	if err := s.oauthIdentities.Create(ctx, userID, provider, info.ProviderUserID, info.Email); err != nil {
		return nil, err
	}
	return &OAuthCompleteResult{User: u, LinkedProvider: provider}, nil
}

func (s *OAuthService) fetchUserInfo(ctx context.Context, provider string, tok *oauth2.Token) (*oauthUserInfo, error) {
	switch provider {
	case OAuthProviderGoogle:
		return s.fetchGoogleUser(ctx, tok)
	case OAuthProviderDiscord:
		return s.fetchDiscordUser(ctx, tok)
	default:
		return nil, ErrOAuthProviderUnknown
	}
}

func (s *OAuthService) fetchGoogleUser(ctx context.Context, tok *oauth2.Token) (*oauthUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v3/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google userinfo: http %d", resp.StatusCode)
	}
	var body struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&body); err != nil {
		return nil, err
	}
	if body.Sub == "" || body.Email == "" || !body.EmailVerified {
		return nil, ErrOAuthEmailRequired
	}
	em, err := validation.Email(body.Email, "Email")
	if err != nil {
		return nil, ErrOAuthEmailRequired
	}
	out := &oauthUserInfo{
		ProviderUserID: body.Sub,
		Email:          em,
		DisplayName:    strings.TrimSpace(body.Name),
	}
	if pic := strings.TrimSpace(body.Picture); pic != "" && strings.HasPrefix(pic, "https://") {
		out.AvatarURL = &pic
	}
	return out, nil
}

func (s *OAuthService) fetchDiscordUser(ctx context.Context, tok *oauth2.Token) (*oauthUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://discord.com/api/users/@me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("discord user: http %d", resp.StatusCode)
	}
	var body struct {
		ID            string `json:"id"`
		Username      string `json:"username"`
		GlobalName    string `json:"global_name"`
		Email         string `json:"email"`
		Verified      bool   `json:"verified"`
		Avatar        string `json:"avatar"`
		Discriminator string `json:"discriminator"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&body); err != nil {
		return nil, err
	}
	if body.ID == "" || body.Email == "" || !body.Verified {
		return nil, ErrOAuthEmailRequired
	}
	em, err := validation.Email(body.Email, "Email")
	if err != nil {
		return nil, ErrOAuthEmailRequired
	}
	dn := strings.TrimSpace(body.GlobalName)
	if dn == "" {
		dn = strings.TrimSpace(body.Username)
	}
	out := &oauthUserInfo{
		ProviderUserID: body.ID,
		Email:          em,
		DisplayName:    dn,
	}
	if body.Avatar != "" {
		ext := "png"
		if strings.HasPrefix(body.Avatar, "a_") {
			ext = "gif"
		}
		u := fmt.Sprintf("https://cdn.discordapp.com/avatars/%s/%s.%s?size=256", body.ID, body.Avatar, ext)
		out.AvatarURL = &u
	}
	return out, nil
}

func (s *OAuthService) loginOrRegister(ctx context.Context, provider string, info *oauthUserInfo, betaInviteID *uuid.UUID) (*OAuthCompleteResult, error) {
	ident, err := s.oauthIdentities.GetByProvider(ctx, provider, info.ProviderUserID)
	if err == nil {
		return s.sessionForUser(ctx, ident.UserID, false)
	}
	if !errors.Is(err, repository.ErrOAuthIdentityNotFound) {
		return nil, err
	}

	existing, err := s.users.GetByEmail(ctx, info.Email)
	if err == nil {
		if models.HasPassword(existing) {
			return nil, ErrOAuthEmailPasswordExists
		}
		return nil, ErrOAuthAccountExists
	}
	if !errors.Is(err, repository.ErrUserNotFound) {
		return nil, err
	}

	if s.betaAccessRequired {
		return nil, ErrOAuthRegisterDisabledInBeta
	}
	return s.registerOAuth(ctx, provider, info)
}

func (s *OAuthService) registerOAuth(ctx context.Context, provider string, info *oauthUserInfo) (*OAuthCompleteResult, error) {
	dn := info.DisplayName
	if dn == "" {
		dn = deriveDisplayName(info.Email)
	} else {
		var err error
		dn, err = validation.StrictPlainText(dn, validation.MaxName, "Display name", false)
		if err != nil {
			dn = deriveDisplayName(info.Email)
		}
	}
	candidates, err := registerUsernameCandidates("", info.Email)
	if err != nil {
		return nil, err
	}
	var u *models.User
	for _, cand := range candidates {
		u, err = s.users.CreateOAuth(ctx, info.Email, dn, cand, info.AvatarURL)
		if err == nil {
			break
		}
		if errors.Is(err, repository.ErrEmailTaken) {
			return nil, err
		}
		if errors.Is(err, repository.ErrUsernameTaken) {
			continue
		}
		return nil, err
	}
	if u == nil {
		return nil, repository.ErrUsernameTaken
	}
	if err := s.oauthIdentities.Create(ctx, u.ID, provider, info.ProviderUserID, info.Email); err != nil {
		return nil, err
	}
	res, err := s.sessionForUser(ctx, u.ID, true)
	if err != nil {
		return nil, err
	}
	if s.auth != nil {
		s.auth.OnAccountCreated(ctx, u)
	}
	return res, nil
}

func (s *OAuthService) sessionForUser(ctx context.Context, userID int64, isNew bool) (*OAuthCompleteResult, error) {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.AccountStatus == models.AccountStatusDeactivated {
		return nil, ErrAccountDeactivated
	}
	raw, h, err := newSessionTokenPair()
	if err != nil {
		return nil, err
	}
	exp := time.Now().Add(s.sessionTTL)
	if err := s.sessions.Create(ctx, u.ID, h, exp); err != nil {
		return nil, err
	}
	return &OAuthCompleteResult{User: u, RawSessionToken: raw, IsNewUser: isNew}, nil
}

func sanitizeOAuthNext(next string) string {
	next = strings.TrimSpace(next)
	if next == "" || !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") {
		return "/"
	}
	if strings.Contains(next, "\n") || strings.Contains(next, "\r") {
		return "/"
	}
	u, err := url.Parse(next)
	if err != nil || u.IsAbs() || u.Host != "" {
		return "/"
	}
	return next
}
