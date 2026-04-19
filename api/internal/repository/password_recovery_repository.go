package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrPasswordRecoveryNotFound = errors.New("no valid recovery code")

type PasswordRecoveryRepository interface {
	ReplaceCode(ctx context.Context, userID int64, codeHash string, expiresAt time.Time) error
	GetLatestValid(ctx context.Context, userID int64) (id int64, codeHash string, err error)
	DeleteForUser(ctx context.Context, userID int64) error
	CountSince(ctx context.Context, userID int64, since time.Time) (int64, error)
}

type PostgresPasswordRecoveryRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresPasswordRecoveryRepository(pool *pgxpool.Pool) *PostgresPasswordRecoveryRepository {
	return &PostgresPasswordRecoveryRepository{pool: pool}
}

func (r *PostgresPasswordRecoveryRepository) ReplaceCode(ctx context.Context, userID int64, codeHash string, expiresAt time.Time) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM password_recovery_codes WHERE user_id = $1`, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO password_recovery_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)
	`, userID, codeHash, expiresAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PostgresPasswordRecoveryRepository) GetLatestValid(ctx context.Context, userID int64) (int64, string, error) {
	var id int64
	var codeHash string
	err := r.pool.QueryRow(ctx, `
		SELECT id, code_hash FROM password_recovery_codes
		WHERE user_id = $1 AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT 1
	`, userID).Scan(&id, &codeHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", ErrPasswordRecoveryNotFound
	}
	if err != nil {
		return 0, "", err
	}
	return id, codeHash, nil
}

func (r *PostgresPasswordRecoveryRepository) DeleteForUser(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM password_recovery_codes WHERE user_id = $1`, userID)
	return err
}

func (r *PostgresPasswordRecoveryRepository) CountSince(ctx context.Context, userID int64, since time.Time) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM password_recovery_codes WHERE user_id = $1 AND created_at >= $2
	`, userID, since).Scan(&n)
	return n, err
}
