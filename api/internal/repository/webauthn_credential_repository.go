package repository

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrWebAuthnCredentialNotFound = errors.New("webauthn credential not found")

// WebAuthnCredentialRecord is a stored passkey for a user.
type WebAuthnCredentialRecord struct {
	ID           int64
	UserID       int64
	CredentialID []byte
	Credential   webauthn.Credential
	Nickname     string
	CreatedAt    time.Time
	LastUsedAt   *time.Time
}

type WebAuthnCredentialRepository interface {
	ListByUserID(ctx context.Context, userID int64) ([]WebAuthnCredentialRecord, error)
	CountByUserID(ctx context.Context, userID int64) (int, error)
	GetByCredentialID(ctx context.Context, credentialID []byte) (*WebAuthnCredentialRecord, error)
	GetByIDAndUserID(ctx context.Context, id, userID int64) (*WebAuthnCredentialRecord, error)
	Create(ctx context.Context, userID int64, credentialID []byte, cred webauthn.Credential, nickname string) (*WebAuthnCredentialRecord, error)
	UpdateCredential(ctx context.Context, id int64, cred webauthn.Credential, lastUsedAt time.Time) error
	UpdateNickname(ctx context.Context, id, userID int64, nickname string) error
	DeleteByIDAndUserID(ctx context.Context, id, userID int64) error
}

type PostgresWebAuthnCredentialRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresWebAuthnCredentialRepository(pool *pgxpool.Pool) *PostgresWebAuthnCredentialRepository {
	return &PostgresWebAuthnCredentialRepository{pool: pool}
}

func scanWebAuthnCredential(row pgx.Row) (*WebAuthnCredentialRecord, error) {
	var rec WebAuthnCredentialRecord
	var credJSON []byte
	var lastUsed *time.Time
	if err := row.Scan(
		&rec.ID,
		&rec.UserID,
		&rec.CredentialID,
		&credJSON,
		&rec.Nickname,
		&rec.CreatedAt,
		&lastUsed,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrWebAuthnCredentialNotFound
		}
		return nil, err
	}
	if err := json.Unmarshal(credJSON, &rec.Credential); err != nil {
		return nil, err
	}
	rec.LastUsedAt = lastUsed
	return &rec, nil
}

func (r *PostgresWebAuthnCredentialRepository) ListByUserID(ctx context.Context, userID int64) ([]WebAuthnCredentialRecord, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, credential_id, credential_json, nickname, created_at, last_used_at
		FROM webauthn_credentials
		WHERE user_id = $1
		ORDER BY created_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WebAuthnCredentialRecord
	for rows.Next() {
		rec, err := scanWebAuthnCredential(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *rec)
	}
	return out, rows.Err()
}

func (r *PostgresWebAuthnCredentialRepository) CountByUserID(ctx context.Context, userID int64) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}

func (r *PostgresWebAuthnCredentialRepository) GetByCredentialID(ctx context.Context, credentialID []byte) (*WebAuthnCredentialRecord, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, credential_id, credential_json, nickname, created_at, last_used_at
		FROM webauthn_credentials
		WHERE credential_id = $1
	`, credentialID)
	return scanWebAuthnCredential(row)
}

func (r *PostgresWebAuthnCredentialRepository) GetByIDAndUserID(ctx context.Context, id, userID int64) (*WebAuthnCredentialRecord, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, credential_id, credential_json, nickname, created_at, last_used_at
		FROM webauthn_credentials
		WHERE id = $1 AND user_id = $2
	`, id, userID)
	return scanWebAuthnCredential(row)
}

func (r *PostgresWebAuthnCredentialRepository) Create(
	ctx context.Context,
	userID int64,
	credentialID []byte,
	cred webauthn.Credential,
	nickname string,
) (*WebAuthnCredentialRecord, error) {
	credJSON, err := json.Marshal(cred)
	if err != nil {
		return nil, err
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO webauthn_credentials (user_id, credential_id, credential_json, nickname)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, credential_id, credential_json, nickname, created_at, last_used_at
	`, userID, credentialID, credJSON, nickname)
	return scanWebAuthnCredential(row)
}

func (r *PostgresWebAuthnCredentialRepository) UpdateCredential(ctx context.Context, id int64, cred webauthn.Credential, lastUsedAt time.Time) error {
	credJSON, err := json.Marshal(cred)
	if err != nil {
		return err
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE webauthn_credentials
		SET credential_json = $2, last_used_at = $3
		WHERE id = $1
	`, id, credJSON, lastUsedAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrWebAuthnCredentialNotFound
	}
	return nil
}

func (r *PostgresWebAuthnCredentialRepository) UpdateNickname(ctx context.Context, id, userID int64, nickname string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE webauthn_credentials SET nickname = $3 WHERE id = $1 AND user_id = $2
	`, id, userID, nickname)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrWebAuthnCredentialNotFound
	}
	return nil
}

func (r *PostgresWebAuthnCredentialRepository) DeleteByIDAndUserID(ctx context.Context, id, userID int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrWebAuthnCredentialNotFound
	}
	return nil
}
