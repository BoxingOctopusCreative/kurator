package service

import (
	"context"
	"errors"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func TestSanitizeOAuthNext(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"":              "/",
		"/collections":  "/collections",
		"//evil":        "/",
		"https://x.com": "/",
		"/login?next=/": "/login?next=/",
	}
	for in, want := range cases {
		if got := sanitizeOAuthNext(in); got != want {
			t.Errorf("sanitizeOAuthNext(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestOAuthSignAndParseState(t *testing.T) {
	t.Parallel()
	s := NewOAuthService(nil, nil, nil, nil, nil, false, nil, OAuthServiceConfig{
		RedirectBaseURL:      "http://localhost:3000",
		GoogleClientID:       "gid",
		GoogleClientSecret:   "gsec",
		JWTSecret:            "test-secret-at-least-32-bytes-long!!",
		SessionMaxAgeSeconds: 3600,
	})
	inv := uuid.MustParse("11111111-1111-4111-8111-111111111111")
	raw, err := s.SignStateLogin(OAuthProviderGoogle, "/wishlists", &inv)
	if err != nil {
		t.Fatal(err)
	}
	st, err := s.ParseState(raw)
	if err != nil {
		t.Fatal(err)
	}
	if st.Provider != OAuthProviderGoogle || st.Next != "/wishlists" {
		t.Fatalf("state: %+v", st)
	}
	if st.InviteID == nil || *st.InviteID != inv {
		t.Fatalf("invite: %+v", st.InviteID)
	}
}

type stubOAuthIdentityRepo struct{}

func (stubOAuthIdentityRepo) GetByProvider(context.Context, string, string) (*repository.OAuthIdentity, error) {
	return nil, repository.ErrOAuthIdentityNotFound
}
func (stubOAuthIdentityRepo) GetByUserAndProvider(context.Context, int64, string) (*repository.OAuthIdentity, error) {
	return nil, repository.ErrOAuthIdentityNotFound
}
func (stubOAuthIdentityRepo) ListByUserID(context.Context, int64) ([]repository.OAuthIdentity, error) {
	return nil, nil
}
func (stubOAuthIdentityRepo) CountByUserID(context.Context, int64) (int, error) {
	return 0, nil
}
func (stubOAuthIdentityRepo) Create(context.Context, int64, string, string, string) error {
	return nil
}
func (stubOAuthIdentityRepo) CreateTx(context.Context, pgx.Tx, int64, string, string, string) error {
	return nil
}
func (stubOAuthIdentityRepo) DeleteByUserAndProvider(context.Context, int64, string) error {
	return nil
}

func TestOAuthLoginOrRegister_BetaBlocksNewAccounts(t *testing.T) {
	t.Parallel()
	users := &stubUserRepo{byEmail: map[string]*models.User{}}
	s := &OAuthService{
		betaAccessRequired: true,
		users:              users,
		oauthIdentities:    stubOAuthIdentityRepo{},
	}
	info := &oauthUserInfo{ProviderUserID: "sub-1", Email: "new@example.com", DisplayName: "New"}
	_, err := s.loginOrRegister(context.Background(), OAuthProviderGoogle, info, nil)
	if !errors.Is(err, ErrOAuthRegisterDisabledInBeta) {
		t.Fatalf("expected ErrOAuthRegisterDisabledInBeta, got %v", err)
	}
}

func TestOAuthEnabledProviders(t *testing.T) {
	t.Parallel()
	empty := NewOAuthService(nil, nil, nil, nil, nil, false, nil, OAuthServiceConfig{
		RedirectBaseURL: "http://localhost:3000",
		JWTSecret:       "test-secret-at-least-32-bytes-long!!",
	})
	if len(empty.EnabledProviders()) != 0 {
		t.Fatalf("expected none, got %v", empty.EnabledProviders())
	}
	both := NewOAuthService(nil, nil, nil, nil, nil, false, nil, OAuthServiceConfig{
		RedirectBaseURL:     "http://localhost:3000",
		GoogleClientID:      "g",
		GoogleClientSecret:  "gs",
		DiscordClientID:     "d",
		DiscordClientSecret: "ds",
		JWTSecret:           "test-secret-at-least-32-bytes-long!!",
	})
	if len(both.EnabledProviders()) != 2 {
		t.Fatalf("expected 2, got %v", both.EnabledProviders())
	}
}
