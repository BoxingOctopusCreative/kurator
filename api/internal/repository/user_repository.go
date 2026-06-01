package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUserNotFound = errors.New("user not found")
var ErrEmailTaken = errors.New("email already registered")
var ErrUsernameTaken = errors.New("username already taken")

type UserRepository interface {
	Create(ctx context.Context, email, passwordHash, displayName, username string) (*models.User, error)
	CreateTx(ctx context.Context, tx pgx.Tx, email, passwordHash, displayName, username string) (*models.User, error)
	CreateOAuth(ctx context.Context, email, displayName, username string, avatarURL *string) (*models.User, error)
	CreateOAuthTx(ctx context.Context, tx pgx.Tx, email, displayName, username string, avatarURL *string) (*models.User, error)
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	GetByID(ctx context.Context, id int64) (*models.User, error)
	GetIDByUsernameCI(ctx context.Context, username string) (int64, error)
	UpdateProfile(ctx context.Context, id int64, displayName, bio string, avatarURL, bannerURL *string, firstName, lastName, location string, firstNamePublic, lastNamePublic bool, socialLinks []byte, username string, profileIsPublic bool, setUsernameLocked bool) error
	UpdateThemePreference(ctx context.Context, id int64, preference string) error
	UpdateColorPreferences(ctx context.Context, id int64, colorScheme string, accessibleExtras bool) error
	UpdateFontPreferences(ctx context.Context, id int64, fontFamily string, accessibleFonts bool) error
	SetTwoFactorPending(ctx context.Context, id int64, secret string) error
	EnableTwoFactor(ctx context.Context, id int64) error
	DisableTwoFactor(ctx context.Context, id int64) error
	UpdatePasswordHash(ctx context.Context, id int64, passwordHash string) error
	UpdateStripeBilling(ctx context.Context, id int64, stripeCustomerID, subscriptionID *string, subscriptionStatus, subscriptionInterval, plan string) error
	UpdateActiveCustomThemeLibrary(ctx context.Context, id int64, libraryID *uuid.UUID) error
	GetUserIDByStripeCustomerID(ctx context.Context, stripeCustomerID string) (int64, error)
	GetUserIDBySubscriptionID(ctx context.Context, subscriptionID string) (int64, error)
	UpdateOnboarding(ctx context.Context, id int64, step int, completed bool) error
	UserHasAnyShelves(ctx context.Context, userID int64) (bool, error)
}

type PostgresUserRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresUserRepository(pool *pgxpool.Pool) *PostgresUserRepository {
	return &PostgresUserRepository{pool: pool}
}

func userScanCols() string {
	return `id, account_status, email, password_hash, username, username_locked, profile_is_public, display_name, first_name, last_name, first_name_public, last_name_public, location, bio, theme_preference, color_scheme, accessible_color_schemes_enabled, font_family, accessible_fonts_enabled, avatar_url, banner_url, social_links, two_factor_enabled, two_factor_secret, stripe_customer_id, subscription_id, subscription_status, subscription_interval, plan, active_custom_theme_library_id, onboarding_completed, onboarding_step, created_at, updated_at`
}

func scanUser(row pgx.Row) (*models.User, error) {
	var u models.User
	var sl []byte
	var passwordHash *string
	err := row.Scan(
		&u.ID, &u.AccountStatus, &u.Email, &passwordHash, &u.Username, &u.UsernameLocked, &u.ProfileIsPublic, &u.DisplayName, &u.FirstName, &u.LastName, &u.FirstNamePublic, &u.LastNamePublic, &u.Location, &u.Bio, &u.ThemePreference, &u.ColorScheme, &u.AccessibleColorSchemesEnabled, &u.FontFamily, &u.AccessibleFontsEnabled, &u.AvatarURL, &u.BannerURL, &sl, &u.TwoFactorEnabled, &u.TwoFactorSecret, &u.StripeCustomerID, &u.SubscriptionID, &u.SubscriptionStatus, &u.SubscriptionInterval, &u.Plan, &u.ActiveCustomThemeLibraryID, &u.OnboardingCompleted, &u.OnboardingStep, &u.CreatedAt, &u.UpdatedAt,
	)
	if passwordHash != nil {
		u.PasswordHash = *passwordHash
	}
	if err != nil {
		return nil, err
	}
	u.SocialLinks = sl
	return &u, nil
}

func (r *PostgresUserRepository) Create(ctx context.Context, email, passwordHash, displayName, username string) (*models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	row := r.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name, username, username_locked)
		VALUES ($1, $2, $3, $4, TRUE)
		RETURNING `+userScanCols(),
		email, passwordHash, displayName, username)
	u, err := scanUser(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			if strings.Contains(strings.ToLower(pgErr.ConstraintName), "username") || strings.Contains(strings.ToLower(pgErr.ConstraintName), "idx_users_username") {
				return nil, ErrUsernameTaken
			}
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return u, nil
}

func (r *PostgresUserRepository) CreateTx(ctx context.Context, tx pgx.Tx, email, passwordHash, displayName, username string) (*models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	row := tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name, username, username_locked)
		VALUES ($1, $2, $3, $4, TRUE)
		RETURNING `+userScanCols(),
		email, passwordHash, displayName, username)
	u, err := scanUser(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			if strings.Contains(strings.ToLower(pgErr.ConstraintName), "username") || strings.Contains(strings.ToLower(pgErr.ConstraintName), "idx_users_username") {
				return nil, ErrUsernameTaken
			}
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return u, nil
}

func (r *PostgresUserRepository) CreateOAuth(ctx context.Context, email, displayName, username string, avatarURL *string) (*models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	row := r.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name, username, username_locked, avatar_url)
		VALUES ($1, NULL, $2, $3, TRUE, $4)
		RETURNING `+userScanCols(),
		email, displayName, username, avatarURL)
	u, err := scanUser(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			if strings.Contains(strings.ToLower(pgErr.ConstraintName), "username") || strings.Contains(strings.ToLower(pgErr.ConstraintName), "idx_users_username") {
				return nil, ErrUsernameTaken
			}
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return u, nil
}

func (r *PostgresUserRepository) CreateOAuthTx(ctx context.Context, tx pgx.Tx, email, displayName, username string, avatarURL *string) (*models.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	row := tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name, username, username_locked, avatar_url)
		VALUES ($1, NULL, $2, $3, TRUE, $4)
		RETURNING `+userScanCols(),
		email, displayName, username, avatarURL)
	u, err := scanUser(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			if strings.Contains(strings.ToLower(pgErr.ConstraintName), "username") || strings.Contains(strings.ToLower(pgErr.ConstraintName), "idx_users_username") {
				return nil, ErrUsernameTaken
			}
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return u, nil
}

func (r *PostgresUserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+userScanCols()+` FROM users WHERE lower(email) = lower($1)
	`, email)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (r *PostgresUserRepository) GetByID(ctx context.Context, id int64) (*models.User, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+userScanCols()+` FROM users WHERE id = $1
	`, id)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

// GetIDByUsernameCI resolves a user id by case-insensitive username.
func (r *PostgresUserRepository) GetIDByUsernameCI(ctx context.Context, username string) (int64, error) {
	var id int64
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM users WHERE lower(username) = lower($1) AND account_status = 'active'
	`, strings.TrimSpace(username)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrUserNotFound
	}
	if err != nil {
		return 0, err
	}
	return id, nil
}

func (r *PostgresUserRepository) UpdateProfile(ctx context.Context, id int64, displayName, bio string, avatarURL, bannerURL *string, firstName, lastName, location string, firstNamePublic, lastNamePublic bool, socialLinks []byte, username string, profileIsPublic bool, setUsernameLocked bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET
			display_name = $2,
			bio = $3,
			avatar_url = $4,
			banner_url = $5,
			first_name = $6,
			last_name = $7,
			first_name_public = $8,
			last_name_public = $9,
			location = $10,
			social_links = $11::jsonb,
			username = $12,
			profile_is_public = $13,
			username_locked = username_locked OR $14,
			updated_at = NOW()
		WHERE id = $1
	`, id, displayName, bio, avatarURL, bannerURL, firstName, lastName, firstNamePublic, lastNamePublic, location, socialLinks, username, profileIsPublic, setUsernameLocked)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrUsernameTaken
		}
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) UpdateThemePreference(ctx context.Context, id int64, preference string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET theme_preference = $2, updated_at = NOW() WHERE id = $1
	`, id, preference)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) UpdateColorPreferences(ctx context.Context, id int64, colorScheme string, accessibleExtras bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET color_scheme = $2, accessible_color_schemes_enabled = $3, updated_at = NOW() WHERE id = $1
	`, id, colorScheme, accessibleExtras)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) UpdateFontPreferences(ctx context.Context, id int64, fontFamily string, accessibleFonts bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET font_family = $2, accessible_fonts_enabled = $3, updated_at = NOW() WHERE id = $1
	`, id, fontFamily, accessibleFonts)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) SetTwoFactorPending(ctx context.Context, id int64, secret string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET two_factor_secret = $2, two_factor_enabled = FALSE, updated_at = NOW() WHERE id = $1
	`, id, secret)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) EnableTwoFactor(ctx context.Context, id int64) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET two_factor_enabled = TRUE, updated_at = NOW()
		WHERE id = $1 AND two_factor_secret IS NOT NULL AND length(trim(two_factor_secret)) > 0
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) DisableTwoFactor(ctx context.Context, id int64) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL, updated_at = NOW() WHERE id = $1
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) UpdatePasswordHash(ctx context.Context, id int64, passwordHash string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1
	`, id, passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// GetPublicByID returns profile fields and whether the profile is marked public in settings.
// viewer is the authenticated user id when known; names are redacted unless public or viewer is the profile owner.
func (r *PostgresUserRepository) GetPublicByID(ctx context.Context, id int64, viewer *int64) (*models.PublicUser, bool, error) {
	var u models.PublicUser
	var sl []byte
	var isPublic bool
	var fn, ln string
	var fnPub, lnPub bool
	err := r.pool.QueryRow(ctx, `
		SELECT id, username, display_name, first_name, last_name, first_name_public, last_name_public,
			location, bio, avatar_url, banner_url, social_links, created_at, profile_is_public
		FROM users WHERE id = $1 AND account_status = 'active'
	`, id).Scan(&u.ID, &u.Username, &u.DisplayName, &fn, &ln, &fnPub, &lnPub, &u.Location, &u.Bio, &u.AvatarURL, &u.BannerURL, &sl, &u.CreatedAt, &isPublic)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, ErrUserNotFound
	}
	if err != nil {
		return nil, false, err
	}
	u.SocialLinks = sl
	own := viewer != nil && *viewer == id
	models.RedactPublicNames(&u, fn, ln, fnPub, lnPub, own)
	return &u, isPublic, nil
}

// SearchPublic finds public profiles by username, display name, bio, location, or public legal names.
func (r *PostgresUserRepository) SearchPublic(ctx context.Context, q string, limit int, excludeID *int64) ([]models.PublicUser, error) {
	if limit <= 0 || limit > 48 {
		limit = 20
	}
	pat := "%" + q + "%"
	var rows pgx.Rows
	var err error
	if excludeID != nil {
		rows, err = r.pool.Query(ctx, `
			SELECT id, username, display_name, first_name, last_name, first_name_public, last_name_public,
				location, bio, avatar_url, banner_url, social_links, created_at
			FROM users
			WHERE id <> $1 AND account_status = 'active' AND profile_is_public = TRUE AND (
				username ILIKE $2 OR display_name ILIKE $2 OR bio ILIKE $2 OR location ILIKE $2
				OR (first_name_public = TRUE AND first_name ILIKE $2)
				OR (last_name_public = TRUE AND last_name ILIKE $2)
				OR (
					first_name_public = TRUE AND last_name_public = TRUE
					AND NULLIF(trim(first_name) || ' ' || trim(last_name), ' ') ILIKE $2
				)
			)
			ORDER BY display_name ASC
			LIMIT $3
		`, *excludeID, pat, limit)
	} else {
		rows, err = r.pool.Query(ctx, `
			SELECT id, username, display_name, first_name, last_name, first_name_public, last_name_public,
				location, bio, avatar_url, banner_url, social_links, created_at
			FROM users
			WHERE account_status = 'active' AND profile_is_public = TRUE AND (
				username ILIKE $1 OR display_name ILIKE $1 OR bio ILIKE $1 OR location ILIKE $1
				OR (first_name_public = TRUE AND first_name ILIKE $1)
				OR (last_name_public = TRUE AND last_name ILIKE $1)
				OR (
					first_name_public = TRUE AND last_name_public = TRUE
					AND NULLIF(trim(first_name) || ' ' || trim(last_name), ' ') ILIKE $1
				)
			)
			ORDER BY display_name ASC
			LIMIT $2
		`, pat, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.PublicUser, 0)
	for rows.Next() {
		var u models.PublicUser
		var sl []byte
		var fn, ln string
		var fnPub, lnPub bool
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &fn, &ln, &fnPub, &lnPub, &u.Location, &u.Bio, &u.AvatarURL, &u.BannerURL, &sl, &u.CreatedAt); err != nil {
			return nil, err
		}
		u.SocialLinks = sl
		models.RedactPublicNames(&u, fn, ln, fnPub, lnPub, false)
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *PostgresUserRepository) UpdateStripeBilling(
	ctx context.Context,
	id int64,
	stripeCustomerID, subscriptionID *string,
	subscriptionStatus, subscriptionInterval, plan string,
) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users
		SET
			stripe_customer_id = $2,
			subscription_id = $3,
			subscription_status = $4,
			subscription_interval = $5,
			plan = $6,
			updated_at = NOW()
		WHERE id = $1
	`, id, stripeCustomerID, subscriptionID, subscriptionStatus, subscriptionInterval, plan)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) UpdateActiveCustomThemeLibrary(ctx context.Context, id int64, libraryID *uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET active_custom_theme_library_id = $2, updated_at = NOW() WHERE id = $1
	`, id, libraryID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) GetUserIDByStripeCustomerID(ctx context.Context, stripeCustomerID string) (int64, error) {
	stripeCustomerID = strings.TrimSpace(stripeCustomerID)
	if stripeCustomerID == "" {
		return 0, ErrUserNotFound
	}
	var id int64
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM users WHERE stripe_customer_id = $1
	`, stripeCustomerID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrUserNotFound
	}
	if err != nil {
		return 0, err
	}
	return id, nil
}

func (r *PostgresUserRepository) GetUserIDBySubscriptionID(ctx context.Context, subscriptionID string) (int64, error) {
	subscriptionID = strings.TrimSpace(subscriptionID)
	if subscriptionID == "" {
		return 0, ErrUserNotFound
	}
	var id int64
	err := r.pool.QueryRow(ctx, `
		SELECT id FROM users WHERE subscription_id = $1
	`, subscriptionID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrUserNotFound
	}
	if err != nil {
		return 0, err
	}
	return id, nil
}

func (r *PostgresUserRepository) UpdateOnboarding(ctx context.Context, id int64, step int, completed bool) error {
	if step < 0 {
		step = 0
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE users SET onboarding_step = $2, onboarding_completed = $3, updated_at = NOW()
		WHERE id = $1
	`, id, step, completed)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresUserRepository) UserHasAnyShelves(ctx context.Context, userID int64) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM collections WHERE user_id = $1
			UNION ALL
			SELECT 1 FROM wishlists WHERE user_id = $1
			UNION ALL
			SELECT 1 FROM lists WHERE user_id = $1
		)
	`, userID).Scan(&exists)
	return exists, err
}
