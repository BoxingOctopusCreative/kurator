package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrBetaInviteNotFound   = errors.New("beta invite not found")
	ErrBetaInviteNotPending = errors.New("beta invite is not pending")
)

// BetaAccessInviteRepository persists email-based beta access requests and approvals.
type BetaAccessInviteRepository interface {
	ReplacePendingInvite(ctx context.Context, requesterEmail, adminTokenHash string) (id uuid.UUID, err error)
	FindPendingByAdminTokenHash(ctx context.Context, adminTokenHash string) (id uuid.UUID, requesterEmail string, err error)
	ApprovePending(ctx context.Context, id uuid.UUID, userTokenHash string, expiresAt time.Time) error
	FindApprovedByUserTokenHash(ctx context.Context, userTokenHash string) (id uuid.UUID, requesterEmail string, expiresAt time.Time, err error)
	LockApprovedForRegistrationTx(ctx context.Context, tx pgx.Tx, inviteID uuid.UUID) (requesterEmail string, err error)
	MarkConsumedTx(ctx context.Context, tx pgx.Tx, inviteID uuid.UUID) error
}

type PostgresBetaAccessInviteRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresBetaAccessInviteRepository(pool *pgxpool.Pool) *PostgresBetaAccessInviteRepository {
	return &PostgresBetaAccessInviteRepository{pool: pool}
}

// ReplacePendingInvite removes any prior pending row for this email and inserts a new pending invite.
func (r *PostgresBetaAccessInviteRepository) ReplacePendingInvite(ctx context.Context, requesterEmail, adminTokenHash string) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `
		DELETE FROM beta_access_invites
		WHERE lower(requester_email) = lower($1) AND status = 'pending'
	`, requesterEmail)
	if err != nil {
		return uuid.Nil, err
	}

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO beta_access_invites (requester_email, admin_token_hash, status)
		VALUES ($1, $2, 'pending')
		RETURNING id
	`, requesterEmail, adminTokenHash).Scan(&id)
	if err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

func (r *PostgresBetaAccessInviteRepository) FindPendingByAdminTokenHash(ctx context.Context, adminTokenHash string) (uuid.UUID, string, error) {
	var id uuid.UUID
	var email string
	err := r.pool.QueryRow(ctx, `
		SELECT id, requester_email
		FROM beta_access_invites
		WHERE admin_token_hash = $1 AND status = 'pending'
	`, adminTokenHash).Scan(&id, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", ErrBetaInviteNotFound
	}
	return id, email, err
}

func (r *PostgresBetaAccessInviteRepository) ApprovePending(ctx context.Context, id uuid.UUID, userTokenHash string, expiresAt time.Time) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE beta_access_invites
		SET status = 'approved',
		    user_token_hash = $2,
		    user_token_expires_at = $3,
		    approved_at = NOW()
		WHERE id = $1 AND status = 'pending'
	`, id, userTokenHash, expiresAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrBetaInviteNotPending
	}
	return nil
}

func (r *PostgresBetaAccessInviteRepository) FindApprovedByUserTokenHash(ctx context.Context, userTokenHash string) (uuid.UUID, string, time.Time, error) {
	var id uuid.UUID
	var email string
	var exp time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT id, requester_email, user_token_expires_at
		FROM beta_access_invites
		WHERE user_token_hash = $1
		  AND status = 'approved'
		  AND user_token_expires_at > NOW()
	`, userTokenHash).Scan(&id, &email, &exp)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", time.Time{}, ErrBetaInviteNotFound
	}
	return id, email, exp, err
}

func (r *PostgresBetaAccessInviteRepository) LockApprovedForRegistrationTx(ctx context.Context, tx pgx.Tx, inviteID uuid.UUID) (string, error) {
	var email string
	err := tx.QueryRow(ctx, `
		SELECT requester_email
		FROM beta_access_invites
		WHERE id = $1 AND status = 'approved'
		FOR UPDATE
	`, inviteID).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrBetaInviteNotFound
	}
	return email, err
}

func (r *PostgresBetaAccessInviteRepository) MarkConsumedTx(ctx context.Context, tx pgx.Tx, inviteID uuid.UUID) error {
	tag, err := tx.Exec(ctx, `
		UPDATE beta_access_invites
		SET status = 'consumed', consumed_at = NOW()
		WHERE id = $1 AND status = 'approved'
	`, inviteID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrBetaInviteNotFound
	}
	return nil
}
