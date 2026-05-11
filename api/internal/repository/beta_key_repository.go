package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrBetaKeyNotFound       = errors.New("beta key not found")
	ErrBetaKeyAlreadyClaimed = errors.New("beta key already claimed")
)

type BetaKeyRepository interface {
	InsertKeyHash(ctx context.Context, keyHash string) (id uuid.UUID, err error)
	ClaimBetaKeyByHash(ctx context.Context, keyHash string) (id uuid.UUID, err error)
	LockClaimedKeyTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
	DeleteClaimedKeyTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) error
}

type PostgresBetaKeyRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresBetaKeyRepository(pool *pgxpool.Pool) *PostgresBetaKeyRepository {
	return &PostgresBetaKeyRepository{pool: pool}
}

func (r *PostgresBetaKeyRepository) InsertKeyHash(ctx context.Context, keyHash string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `
		INSERT INTO beta_keys (key_hash) VALUES ($1)
		RETURNING id
	`, keyHash).Scan(&id)
	return id, err
}

// ClaimBetaKeyByHash sets claimed=true for an unclaimed row matching key_hash and returns its id.
func (r *PostgresBetaKeyRepository) ClaimBetaKeyByHash(ctx context.Context, keyHash string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `
		UPDATE beta_keys SET claimed = true
		WHERE key_hash = $1 AND claimed = false
		RETURNING id
	`, keyHash).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, err
	}
	var claimed bool
	err2 := r.pool.QueryRow(ctx, `SELECT claimed FROM beta_keys WHERE key_hash = $1`, keyHash).Scan(&claimed)
	if errors.Is(err2, pgx.ErrNoRows) {
		return uuid.Nil, ErrBetaKeyNotFound
	}
	if err2 != nil {
		return uuid.Nil, err2
	}
	if claimed {
		return uuid.Nil, ErrBetaKeyAlreadyClaimed
	}
	return uuid.Nil, ErrBetaKeyNotFound
}

func (r *PostgresBetaKeyRepository) LockClaimedKeyTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	var one int
	err := tx.QueryRow(ctx, `
		SELECT 1 FROM beta_keys WHERE id = $1 AND claimed = true FOR UPDATE
	`, id).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrBetaKeyNotFound
	}
	return err
}

func (r *PostgresBetaKeyRepository) DeleteClaimedKeyTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	tag, err := tx.Exec(ctx, `
		DELETE FROM beta_keys WHERE id = $1 AND claimed = true
	`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("beta key delete failed")
	}
	return nil
}
