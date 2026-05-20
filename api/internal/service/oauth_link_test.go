package service

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
)

type linkOAuthRepo struct {
	stubOAuthIdentityRepo
	byUserProvider map[string]*repository.OAuthIdentity
	byProvider     map[string]*repository.OAuthIdentity
	count          int
}

func (r *linkOAuthRepo) GetByUserAndProvider(_ context.Context, userID int64, provider string) (*repository.OAuthIdentity, error) {
	if row, ok := r.byUserProvider[oauthUserProviderKey(userID, provider)]; ok {
		return row, nil
	}
	return nil, repository.ErrOAuthIdentityNotFound
}

func (r *linkOAuthRepo) GetByProvider(_ context.Context, provider, providerUserID string) (*repository.OAuthIdentity, error) {
	if row, ok := r.byProvider[provider+":"+providerUserID]; ok {
		return row, nil
	}
	return nil, repository.ErrOAuthIdentityNotFound
}

func (r *linkOAuthRepo) CountByUserID(context.Context, int64) (int, error) {
	return r.count, nil
}

func oauthUserProviderKey(userID int64, provider string) string {
	return fmt.Sprintf("%d:%s", userID, provider)
}

func TestLinkProvider_allowsDifferentProviderEmail(t *testing.T) {
	t.Parallel()
	users := &stubUserRepo{
		byID: map[int64]*models.User{
			1: {ID: 1, Email: "me@example.com", PasswordHash: "hash"},
		},
	}
	s := &OAuthService{
		users:           users,
		oauthIdentities: &linkOAuthRepo{count: 0},
	}
	res, err := s.linkProvider(context.Background(), 1, OAuthProviderGoogle, &oauthUserInfo{
		ProviderUserID: "g-1",
		Email:          "other@example.com",
	})
	if err != nil {
		t.Fatalf("linkProvider: %v", err)
	}
	if res == nil || res.User.ID != 1 || res.LinkedProvider != OAuthProviderGoogle {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestUnlinkProvider_lastAuthMethod(t *testing.T) {
	t.Parallel()
	users := &stubUserRepo{
		byID: map[int64]*models.User{
			2: {ID: 2, Email: "oauth@example.com"},
		},
	}
	repo := &linkOAuthRepo{
		count: 1,
		byUserProvider: map[string]*repository.OAuthIdentity{
			oauthUserProviderKey(2, OAuthProviderGoogle): {UserID: 2, Provider: OAuthProviderGoogle},
		},
	}
	s := &OAuthService{users: users, oauthIdentities: repo}
	err := s.UnlinkProvider(context.Background(), 2, OAuthProviderGoogle)
	if !errors.Is(err, ErrOAuthLastAuthMethod) {
		t.Fatalf("expected ErrOAuthLastAuthMethod, got %v", err)
	}
}
