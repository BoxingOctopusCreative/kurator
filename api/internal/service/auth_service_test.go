package service

import (
	"context"
	"testing"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/notifyqueue"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

func mustNotifyClient() *notifyqueue.Client {
	c, err := notifyqueue.New("", "", notifyqueue.Deps{})
	if err != nil {
		panic(err)
	}
	return c
}

type stubUserRepo struct {
	createReturn *models.User
	createErr    error
	byEmail      map[string]*models.User
	byID         map[int64]*models.User
}

func (s *stubUserRepo) CreateTx(ctx context.Context, _ pgx.Tx, email, passwordHash, displayName, username string) (*models.User, error) {
	return s.Create(ctx, email, passwordHash, displayName, username)
}

func (s *stubUserRepo) CreateOAuthTx(ctx context.Context, _ pgx.Tx, email, displayName, username string, avatarURL *string) (*models.User, error) {
	return s.CreateOAuth(ctx, email, displayName, username, avatarURL)
}

func (s *stubUserRepo) CreateOAuth(ctx context.Context, email, displayName, username string, avatarURL *string) (*models.User, error) {
	return s.Create(ctx, email, "", displayName, username)
}

func (s *stubUserRepo) Create(ctx context.Context, email, passwordHash, displayName, username string) (*models.User, error) {
	if s.createErr != nil {
		return nil, s.createErr
	}
	if s.createReturn != nil {
		return s.createReturn, nil
	}
	return &models.User{
		ID:              1,
		Email:           email,
		PasswordHash:    passwordHash,
		Username:        username,
		ProfileIsPublic: true,
		DisplayName:     displayName,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}, nil
}

func (s *stubUserRepo) GetIDByUsernameCI(ctx context.Context, username string) (int64, error) {
	return 0, repository.ErrUserNotFound
}

func (s *stubUserRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	if s.byEmail == nil {
		return nil, repository.ErrUserNotFound
	}
	u, ok := s.byEmail[email]
	if !ok {
		return nil, repository.ErrUserNotFound
	}
	return u, nil
}

func (s *stubUserRepo) GetByID(ctx context.Context, id int64) (*models.User, error) {
	if s.byID == nil {
		return nil, repository.ErrUserNotFound
	}
	u, ok := s.byID[id]
	if !ok {
		return nil, repository.ErrUserNotFound
	}
	return u, nil
}

func (s *stubUserRepo) UpdateProfile(ctx context.Context, id int64, displayName, bio string, avatarURL, bannerURL *string, firstName, lastName, location string, firstNamePublic, lastNamePublic bool, socialLinks []byte, username string, profileIsPublic bool, setUsernameLocked bool) error {
	return nil
}

func (s *stubUserRepo) UpdateThemePreference(ctx context.Context, id int64, preference string) error {
	return nil
}

func (s *stubUserRepo) UpdateColorPreferences(ctx context.Context, id int64, colorScheme string, accessibleExtras bool) error {
	return nil
}

func (s *stubUserRepo) UpdateFontPreferences(ctx context.Context, id int64, fontFamily string, accessibleFonts bool) error {
	return nil
}

func (s *stubUserRepo) SetTwoFactorPending(ctx context.Context, id int64, secret string) error {
	return nil
}

func (s *stubUserRepo) EnableTwoFactor(ctx context.Context, id int64) error {
	return nil
}

func (s *stubUserRepo) DisableTwoFactor(ctx context.Context, id int64) error {
	return nil
}

func (s *stubUserRepo) UpdatePasswordHash(ctx context.Context, id int64, passwordHash string) error {
	return nil
}

func (s *stubUserRepo) UpdateStripeBilling(ctx context.Context, id int64, stripeCustomerID, subscriptionID *string, subscriptionStatus, subscriptionInterval, plan string) error {
	return nil
}

func (s *stubUserRepo) UpdateActiveCustomThemeLibrary(ctx context.Context, id int64, libraryID *uuid.UUID) error {
	return nil
}

func (s *stubUserRepo) GetUserIDByStripeCustomerID(ctx context.Context, stripeCustomerID string) (int64, error) {
	return 0, repository.ErrUserNotFound
}

func (s *stubUserRepo) GetUserIDBySubscriptionID(ctx context.Context, subscriptionID string) (int64, error) {
	return 0, repository.ErrUserNotFound
}

func (s *stubUserRepo) UpdateOnboarding(ctx context.Context, id int64, step int, completed bool) error {
	return nil
}

func (s *stubUserRepo) UserHasAnyShelves(ctx context.Context, userID int64) (bool, error) {
	return false, nil
}

func (s *stubUserRepo) SearchPublic(ctx context.Context, q string, limit int, excludeID *int64) ([]models.PublicUser, error) {
	return nil, nil
}

type stubSessionRepo struct {
	lastUserID int64
	lastHash   string
	createErr  error
}

func (s *stubSessionRepo) CreateTx(ctx context.Context, _ pgx.Tx, userID int64, tokenHash string, expiresAt time.Time) error {
	return s.Create(ctx, userID, tokenHash, expiresAt)
}

func (s *stubSessionRepo) Create(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time) error {
	if s.createErr != nil {
		return s.createErr
	}
	s.lastUserID = userID
	s.lastHash = tokenHash
	return nil
}

func (s *stubSessionRepo) DeleteByTokenHash(ctx context.Context, tokenHash string) error {
	return nil
}

func (s *stubSessionRepo) DeleteAllForUser(ctx context.Context, userID int64) error {
	return nil
}

func (s *stubSessionRepo) FindUserByValidToken(ctx context.Context, tokenHash string) (int64, error) {
	return 0, repository.ErrSessionInvalid
}

func (s *stubSessionRepo) PurgeExpired(ctx context.Context) error {
	return nil
}

func TestAuthService_Register_invalidEmail(t *testing.T) {
	auth := NewAuthService(nil, &stubUserRepo{}, &stubSessionRepo{}, nil, nil, "", "test-secret-jwt-at-least-32-bytes!!", 3600, false, mustNotifyClient())
	_, _, err := auth.Register(context.Background(), "not-an-email", "password123", "", "", nil)
	if err != ErrInvalidEmail {
		t.Fatalf("got %v want ErrInvalidEmail", err)
	}
}

func TestAuthService_Register_weakPassword(t *testing.T) {
	auth := NewAuthService(nil, &stubUserRepo{}, &stubSessionRepo{}, nil, nil, "", "test-secret-jwt-at-least-32-bytes!!", 3600, false, mustNotifyClient())
	_, _, err := auth.Register(context.Background(), "ok@example.com", "short", "", "", nil)
	if err != ErrWeakPassword {
		t.Fatalf("got %v want ErrWeakPassword", err)
	}
}

func TestAuthService_Register_createsSession(t *testing.T) {
	users := &stubUserRepo{}
	sessions := &stubSessionRepo{}
	auth := NewAuthService(nil, users, sessions, nil, nil, "", "test-secret-jwt-at-least-32-bytes!!", 3600, false, mustNotifyClient())
	u, raw, err := auth.Register(context.Background(), "new@example.com", "password123", "Nick", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "new@example.com" || u.DisplayName != "Nick" {
		t.Fatalf("user %+v", u)
	}
	if raw == "" {
		t.Fatal("expected raw session token")
	}
	if sessions.lastUserID != u.ID || sessions.lastHash == "" {
		t.Fatalf("session not created: userID=%d hashEmpty=%v", sessions.lastUserID, sessions.lastHash == "")
	}
}

func TestAuthService_Login_badPassword(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("right-pass"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	users := &stubUserRepo{
		byEmail: map[string]*models.User{
			"u@example.com": {ID: 1, Email: "u@example.com", PasswordHash: string(hash)},
		},
	}
	auth := NewAuthService(nil, users, &stubSessionRepo{}, nil, nil, "", "test-secret-jwt-at-least-32-bytes!!", 3600, false, mustNotifyClient())
	_, err = auth.Login(context.Background(), "u@example.com", "wrong-pass")
	if err != ErrInvalidCredentials {
		t.Fatalf("got %v", err)
	}
}

func TestAuthService_Login_successNo2FA(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("secret1234"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	users := &stubUserRepo{
		byEmail: map[string]*models.User{
			"ok@example.com": {ID: 2, Email: "ok@example.com", PasswordHash: string(hash)},
		},
	}
	sessions := &stubSessionRepo{}
	auth := NewAuthService(nil, users, sessions, nil, nil, "", "test-secret-jwt-at-least-32-bytes!!", 3600, false, mustNotifyClient())
	res, err := auth.Login(context.Background(), "ok@example.com", "secret1234")
	if err != nil {
		t.Fatal(err)
	}
	if res.Pending2FAToken != "" {
		t.Fatal("did not expect 2FA pending")
	}
	if res.RawSessionToken == "" {
		t.Fatal("expected session token")
	}
	if sessions.lastUserID != 2 || sessions.lastHash == "" {
		t.Fatalf("session: uid=%d hashSet=%v", sessions.lastUserID, sessions.lastHash != "")
	}
}

func TestAuthService_Login_pending2FA(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("pw12345678"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	sec := "BASE32SECRETBASE32SECRETBASE32"
	users := &stubUserRepo{
		byEmail: map[string]*models.User{
			"2fa@example.com": {
				ID:               3,
				Email:            "2fa@example.com",
				PasswordHash:     string(hash),
				TwoFactorEnabled: true,
				TwoFactorSecret:  &sec,
			},
		},
	}
	auth := NewAuthService(nil, users, &stubSessionRepo{}, nil, nil, "", "test-secret-jwt-at-least-32-bytes!!", 3600, false, mustNotifyClient())
	res, err := auth.Login(context.Background(), "2fa@example.com", "pw12345678")
	if err != nil {
		t.Fatal(err)
	}
	if res.Pending2FAToken == "" {
		t.Fatal("expected pending JWT")
	}
	if res.RawSessionToken != "" {
		t.Fatal("should not issue session before TOTP")
	}
}

func TestAuthService_UserIDFromSession_invalid(t *testing.T) {
	auth := NewAuthService(nil, &stubUserRepo{}, &stubSessionRepo{}, nil, nil, "", "test-secret-jwt-at-least-32-bytes!!", 3600, false, mustNotifyClient())
	_, err := auth.UserIDFromSession(context.Background(), "")
	if err != repository.ErrSessionInvalid {
		t.Fatalf("got %v", err)
	}
}
