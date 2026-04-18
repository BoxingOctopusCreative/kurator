package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrSessionInvalid = errors.New("session invalid or expired")

type SessionRepository interface {
	Create(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time) error
	DeleteByTokenHash(ctx context.Context, tokenHash string) error
	FindUserByValidToken(ctx context.Context, tokenHash string) (int64, error)
	PurgeExpired(ctx context.Context) error
}

type PostgresSessionRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresSessionRepository(pool *pgxpool.Pool) *PostgresSessionRepository {
	return &PostgresSessionRepository{pool: pool}
}

func (r *PostgresSessionRepository) Create(ctx context.Context, userID int64, tokenHash string, expiresAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
	`, userID, tokenHash, expiresAt)
	return err
}

func (r *PostgresSessionRepository) DeleteByTokenHash(ctx context.Context, tokenHash string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash)
	return err
}

func (r *PostgresSessionRepository) FindUserByValidToken(ctx context.Context, tokenHash string) (int64, error) {
	_ = r.PurgeExpired(ctx)
	var uid int64
	err := r.pool.QueryRow(ctx, `
		SELECT user_id FROM sessions
		WHERE token_hash = $1 AND expires_at > NOW()
	`, tokenHash).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrSessionInvalid
	}
	if err != nil {
		return 0, err
	}
	return uid, nil
}

func (r *PostgresSessionRepository) PurgeExpired(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= NOW()`)
	return err
}
