package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrOAuthIdentityNotFound = errors.New("oauth identity not found")

// OAuthIdentity links a Kurator user to an external OAuth account.
type OAuthIdentity struct {
	ID             int64
	UserID         int64
	Provider       string
	ProviderUserID string
	ProviderEmail  string
	CreatedAt      time.Time
}

type OAuthIdentityRepository interface {
	GetByProvider(ctx context.Context, provider, providerUserID string) (*OAuthIdentity, error)
	GetByUserAndProvider(ctx context.Context, userID int64, provider string) (*OAuthIdentity, error)
	ListByUserID(ctx context.Context, userID int64) ([]OAuthIdentity, error)
	CountByUserID(ctx context.Context, userID int64) (int, error)
	Create(ctx context.Context, userID int64, provider, providerUserID, providerEmail string) error
	CreateTx(ctx context.Context, tx pgx.Tx, userID int64, provider, providerUserID, providerEmail string) error
	DeleteByUserAndProvider(ctx context.Context, userID int64, provider string) error
}

type PostgresOAuthIdentityRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresOAuthIdentityRepository(pool *pgxpool.Pool) *PostgresOAuthIdentityRepository {
	return &PostgresOAuthIdentityRepository{pool: pool}
}

func (r *PostgresOAuthIdentityRepository) GetByProvider(ctx context.Context, provider, providerUserID string) (*OAuthIdentity, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, provider, provider_user_id, COALESCE(provider_email, ''), created_at
		FROM oauth_identities
		WHERE provider = $1 AND provider_user_id = $2
	`, provider, providerUserID)
	var o OAuthIdentity
	err := row.Scan(&o.ID, &o.UserID, &o.Provider, &o.ProviderUserID, &o.ProviderEmail, &o.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOAuthIdentityNotFound
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *PostgresOAuthIdentityRepository) GetByUserAndProvider(ctx context.Context, userID int64, provider string) (*OAuthIdentity, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, provider, provider_user_id, COALESCE(provider_email, ''), created_at
		FROM oauth_identities
		WHERE user_id = $1 AND provider = $2
	`, userID, provider)
	var o OAuthIdentity
	err := row.Scan(&o.ID, &o.UserID, &o.Provider, &o.ProviderUserID, &o.ProviderEmail, &o.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrOAuthIdentityNotFound
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *PostgresOAuthIdentityRepository) ListByUserID(ctx context.Context, userID int64) ([]OAuthIdentity, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, provider, provider_user_id, COALESCE(provider_email, ''), created_at
		FROM oauth_identities
		WHERE user_id = $1
		ORDER BY provider ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]OAuthIdentity, 0, 2)
	for rows.Next() {
		var o OAuthIdentity
		if err := rows.Scan(&o.ID, &o.UserID, &o.Provider, &o.ProviderUserID, &o.ProviderEmail, &o.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (r *PostgresOAuthIdentityRepository) CountByUserID(ctx context.Context, userID int64) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM oauth_identities WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}

func (r *PostgresOAuthIdentityRepository) DeleteByUserAndProvider(ctx context.Context, userID int64, provider string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM oauth_identities WHERE user_id = $1 AND provider = $2`, userID, provider)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrOAuthIdentityNotFound
	}
	return nil
}

func (r *PostgresOAuthIdentityRepository) Create(ctx context.Context, userID int64, provider, providerUserID, providerEmail string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO oauth_identities (user_id, provider, provider_user_id, provider_email)
		VALUES ($1, $2, $3, NULLIF(trim($4), ''))
	`, userID, provider, providerUserID, providerEmail)
	return err
}

func (r *PostgresOAuthIdentityRepository) CreateTx(ctx context.Context, tx pgx.Tx, userID int64, provider, providerUserID, providerEmail string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO oauth_identities (user_id, provider, provider_user_id, provider_email)
		VALUES ($1, $2, $3, NULLIF(trim($4), ''))
	`, userID, provider, providerUserID, providerEmail)
	return err
}
