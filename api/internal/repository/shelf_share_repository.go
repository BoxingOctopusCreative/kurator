package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrShelfNotFound              = errors.New("shelf not found")
	ErrShelfAccessPendingExists   = errors.New("a pending shelf access request already exists")
	ErrShelfAccessRequestNotFound = errors.New("shelf access request not found")
	ErrShelfAccessNotPending      = errors.New("shelf access request is not pending")
)

type ShelfKind string

const (
	ShelfKindCollection ShelfKind = "collection"
	ShelfKindList       ShelfKind = "list"
	ShelfKindWishlist   ShelfKind = "wishlist"
)

func (k ShelfKind) String() string { return string(k) }

func ParseShelfKind(s string) (ShelfKind, error) {
	switch s {
	case string(ShelfKindCollection):
		return ShelfKindCollection, nil
	case string(ShelfKindList):
		return ShelfKindList, nil
	case string(ShelfKindWishlist):
		return ShelfKindWishlist, nil
	default:
		return "", fmt.Errorf("invalid shelf_kind")
	}
}

type ShelfAccessRequestRow struct {
	ID          int64
	ShelfKind   ShelfKind
	ShelfID     string
	Flow        string
	RequesterID int64
	RecipientID int64
	Status      string
}

type PostgresShelfShareRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresShelfShareRepository(pool *pgxpool.Pool) *PostgresShelfShareRepository {
	return &PostgresShelfShareRepository{pool: pool}
}

func (r *PostgresShelfShareRepository) AddMember(ctx context.Context, kind ShelfKind, shelfID string, userID int64) error {
	if r == nil || r.pool == nil {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO shelf_members (shelf_kind, shelf_id, user_id) VALUES ($1, $2::uuid, $3)
		ON CONFLICT (shelf_kind, shelf_id, user_id) DO NOTHING
	`, string(kind), shelfID, userID)
	if err != nil {
		return fmt.Errorf("add shelf member: %w", err)
	}
	return nil
}

func (r *PostgresShelfShareRepository) IsMember(ctx context.Context, kind ShelfKind, shelfID string, userID int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM shelf_members
			WHERE shelf_kind = $1 AND shelf_id = $2::uuid AND user_id = $3
		)
	`, string(kind), shelfID, userID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("is shelf member: %w", err)
	}
	return ok, nil
}

// LoadShelfShareMeta returns is_shared, owner user id, and display name for notifications.
func (r *PostgresShelfShareRepository) LoadShelfShareMeta(ctx context.Context, kind ShelfKind, shelfID string) (isShared bool, ownerID int64, name string, err error) {
	switch kind {
	case ShelfKindCollection:
		err = r.pool.QueryRow(ctx, `
			SELECT COALESCE(c.is_shared, false), COALESCE(c.user_id, 0), c.name
			FROM collections c WHERE c.id = $1::uuid
		`, shelfID).Scan(&isShared, &ownerID, &name)
	case ShelfKindList:
		err = r.pool.QueryRow(ctx, `
			SELECT l.is_shared, l.user_id, l.name FROM lists l WHERE l.id = $1::uuid
		`, shelfID).Scan(&isShared, &ownerID, &name)
	case ShelfKindWishlist:
		err = r.pool.QueryRow(ctx, `
			SELECT w.is_shared, w.user_id, w.name FROM wishlists w WHERE w.id = $1::uuid
		`, shelfID).Scan(&isShared, &ownerID, &name)
	default:
		return false, 0, "", fmt.Errorf("invalid shelf kind")
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, 0, "", ErrShelfNotFound
	}
	if err != nil {
		return false, 0, "", err
	}
	return isShared, ownerID, name, nil
}

func (r *PostgresShelfShareRepository) InsertAccessRequest(ctx context.Context, kind ShelfKind, shelfID, flow string, requesterID, recipientID int64) (int64, error) {
	var id int64
	err := r.pool.QueryRow(ctx, `
		INSERT INTO shelf_access_requests (shelf_kind, shelf_id, flow, requester_id, recipient_id)
		VALUES ($1, $2::uuid, $3, $4, $5)
		RETURNING id
	`, string(kind), shelfID, flow, requesterID, recipientID).Scan(&id)
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			return 0, ErrShelfAccessPendingExists
		}
		return 0, fmt.Errorf("insert shelf access request: %w", err)
	}
	return id, nil
}

func (r *PostgresShelfShareRepository) GetAccessRequestForRecipient(ctx context.Context, id int64, recipientID int64) (*ShelfAccessRequestRow, error) {
	var row ShelfAccessRequestRow
	var kindStr string
	err := r.pool.QueryRow(ctx, `
		SELECT id, shelf_kind, shelf_id::text, flow, requester_id, recipient_id, status
		FROM shelf_access_requests
		WHERE id = $1 AND recipient_id = $2
	`, id, recipientID).Scan(&row.ID, &kindStr, &row.ShelfID, &row.Flow, &row.RequesterID, &row.RecipientID, &row.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrShelfAccessRequestNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get shelf access request: %w", err)
	}
	k, err := ParseShelfKind(kindStr)
	if err != nil {
		return nil, err
	}
	row.ShelfKind = k
	return &row, nil
}

// ResolveAccessRequest sets status to approved or dismissed; when approved, inserts the new member.
func (r *PostgresShelfShareRepository) ResolveAccessRequest(ctx context.Context, id int64, recipientID int64, approve bool) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var row ShelfAccessRequestRow
	var kindStr string
	err = tx.QueryRow(ctx, `
		SELECT id, shelf_kind, shelf_id::text, flow, requester_id, recipient_id, status
		FROM shelf_access_requests WHERE id = $1 FOR UPDATE
	`, id).Scan(&row.ID, &kindStr, &row.ShelfID, &row.Flow, &row.RequesterID, &row.RecipientID, &row.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrShelfAccessRequestNotFound
	}
	if err != nil {
		return fmt.Errorf("lock shelf access request: %w", err)
	}
	if row.RecipientID != recipientID {
		return ErrShelfAccessRequestNotFound
	}
	if row.Status != "pending" {
		return ErrShelfAccessNotPending
	}
	kind, err := ParseShelfKind(kindStr)
	if err != nil {
		return err
	}
	newMember := row.RequesterID
	if row.Flow == "invite" {
		newMember = row.RecipientID
	}
	nextStatus := "dismissed"
	if approve {
		nextStatus = "approved"
		if err := r.addMemberTx(ctx, tx, kind, row.ShelfID, newMember); err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, `
		UPDATE shelf_access_requests
		SET status = $2, resolved_at = NOW()
		WHERE id = $1 AND status = 'pending'
	`, id, nextStatus)
	if err != nil {
		return fmt.Errorf("update shelf access request: %w", err)
	}
	return tx.Commit(ctx)
}

func (r *PostgresShelfShareRepository) addMemberTx(ctx context.Context, tx pgx.Tx, kind ShelfKind, shelfID string, userID int64) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO shelf_members (shelf_kind, shelf_id, user_id) VALUES ($1, $2::uuid, $3)
		ON CONFLICT (shelf_kind, shelf_id, user_id) DO NOTHING
	`, string(kind), shelfID, userID)
	if err != nil {
		return fmt.Errorf("add shelf member: %w", err)
	}
	return nil
}
