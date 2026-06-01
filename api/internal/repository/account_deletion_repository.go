package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrAccountNotActive          = errors.New("account is not active")
	ErrInvalidOwnershipTransfer  = errors.New("invalid ownership transfer")
	ErrSuccessionNotFound        = errors.New("shelf ownership succession not found")
	ErrSuccessionNotPending      = errors.New("shelf ownership succession is not pending")
	ErrSuccessionNotEligible     = errors.New("not eligible for this succession action")
)

type PostgresAccountDeletionRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresAccountDeletionRepository(pool *pgxpool.Pool) *PostgresAccountDeletionRepository {
	return &PostgresAccountDeletionRepository{pool: pool}
}

type SuccessionNotify struct {
	ID        int64
	Kind      ShelfKind
	ShelfID   string
	ShelfName string
	Mode      string
	Members   []models.SharedShelfMemberOption
}

// DeactivateAccount applies transfers, creates successions for untransferred shared shelves, deactivates the user, and stores a reactivation token.
func (r *PostgresAccountDeletionRepository) DeactivateAccount(
	ctx context.Context,
	userID int64,
	transfers []models.ShelfOwnershipTransfer,
	transferKeys map[string]int64,
	purgeAt, tokenExpires time.Time,
	tokenHash string,
) ([]SuccessionNotify, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, t := range transfers {
		kind, err := ParseShelfKind(t.Kind)
		if err != nil {
			return nil, err
		}
		if err := r.TransferShelfOwnershipTx(ctx, tx, kind, strings.TrimSpace(t.ShelfID), userID, t.NewOwnerID); err != nil {
			return nil, err
		}
	}

	shared, err := r.listSharedOwnedShelvesTx(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	var out []SuccessionNotify
	for _, sh := range shared {
		key := sh.Kind + ":" + sh.ID
		if _, transferred := transferKeys[key]; transferred {
			continue
		}
		if len(sh.Members) == 0 {
			continue
		}
		kind, err := ParseShelfKind(sh.Kind)
		if err != nil {
			return nil, err
		}
		mode := "election"
		if len(sh.Members) == 1 {
			mode = "sole_takeover"
		}
		sid, err := r.InsertSuccessionTx(ctx, tx, kind, sh.ID, userID, mode)
		if err != nil {
			return nil, err
		}
		out = append(out, SuccessionNotify{
			ID: sid, Kind: kind, ShelfID: sh.ID, ShelfName: sh.Name, Mode: mode, Members: sh.Members,
		})
	}

	if err := r.DeactivateUserTx(ctx, tx, userID, purgeAt); err != nil {
		return nil, err
	}
	if err := r.InsertReactivationTokenTx(ctx, tx, userID, tokenHash, tokenExpires); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *PostgresAccountDeletionRepository) listSharedOwnedShelvesTx(ctx context.Context, tx pgx.Tx, ownerID int64) ([]models.SharedShelfForDeletion, error) {
	type row struct {
		kind string
		id   string
		name string
	}
	var shelves []row
	for _, q := range []struct {
		kind string
		sql  string
	}{
		{"collection", `SELECT 'collection', c.id::text, c.name FROM collections c WHERE c.user_id = $1 AND c.is_shared = TRUE`},
		{"list", `SELECT 'list', l.id::text, l.name FROM lists l WHERE l.user_id = $1 AND l.is_shared = TRUE`},
		{"wishlist", `SELECT 'wishlist', w.id::text, w.name FROM wishlists w WHERE w.user_id = $1 AND w.is_shared = TRUE`},
	} {
		rows, err := tx.Query(ctx, q.sql, ownerID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var rr row
			if err := rows.Scan(&rr.kind, &rr.id, &rr.name); err != nil {
				rows.Close()
				return nil, err
			}
			shelves = append(shelves, rr)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	out := make([]models.SharedShelfForDeletion, 0, len(shelves))
	for _, s := range shelves {
		members, err := r.listShelfMembersTx(ctx, tx, s.kind, s.id, ownerID)
		if err != nil {
			return nil, err
		}
		out = append(out, models.SharedShelfForDeletion{Kind: s.kind, ID: s.id, Name: s.name, Members: members})
	}
	return out, nil
}

func (r *PostgresAccountDeletionRepository) listShelfMembersTx(ctx context.Context, tx pgx.Tx, kind, shelfID string, excludeOwner int64) ([]models.SharedShelfMemberOption, error) {
	rows, err := tx.Query(ctx, `
		SELECT u.id, u.username, u.display_name
		FROM shelf_members sm
		JOIN users u ON u.id = sm.user_id
		WHERE sm.shelf_kind = $1 AND sm.shelf_id = $2::uuid AND sm.user_id <> $3
		  AND u.account_status = 'active'
		ORDER BY u.display_name ASC
	`, kind, shelfID, excludeOwner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SharedShelfMemberOption
	for rows.Next() {
		var m models.SharedShelfMemberOption
		if err := rows.Scan(&m.UserID, &m.Username, &m.DisplayName); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *PostgresAccountDeletionRepository) ListSharedOwnedShelves(ctx context.Context, ownerID int64) ([]models.SharedShelfForDeletion, error) {
	type row struct {
		kind string
		id   string
		name string
	}
	var shelves []row
	for _, q := range []struct {
		kind string
		sql  string
	}{
		{"collection", `SELECT 'collection', c.id::text, c.name FROM collections c WHERE c.user_id = $1 AND c.is_shared = TRUE`},
		{"list", `SELECT 'list', l.id::text, l.name FROM lists l WHERE l.user_id = $1 AND l.is_shared = TRUE`},
		{"wishlist", `SELECT 'wishlist', w.id::text, w.name FROM wishlists w WHERE w.user_id = $1 AND w.is_shared = TRUE`},
	} {
		rows, err := r.pool.Query(ctx, q.sql, ownerID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var rr row
			if err := rows.Scan(&rr.kind, &rr.id, &rr.name); err != nil {
				rows.Close()
				return nil, err
			}
			shelves = append(shelves, rr)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	out := make([]models.SharedShelfForDeletion, 0, len(shelves))
	for _, s := range shelves {
		members, err := r.listShelfMembers(ctx, s.kind, s.id, ownerID)
		if err != nil {
			return nil, err
		}
		out = append(out, models.SharedShelfForDeletion{
			Kind:    s.kind,
			ID:      s.id,
			Name:    s.name,
			Members: members,
		})
	}
	return out, nil
}

func (r *PostgresAccountDeletionRepository) listShelfMembers(ctx context.Context, kind, shelfID string, excludeOwner int64) ([]models.SharedShelfMemberOption, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT u.id, u.username, u.display_name
		FROM shelf_members sm
		JOIN users u ON u.id = sm.user_id
		WHERE sm.shelf_kind = $1 AND sm.shelf_id = $2::uuid AND sm.user_id <> $3
		  AND u.account_status = 'active'
		ORDER BY u.display_name ASC
	`, kind, shelfID, excludeOwner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.SharedShelfMemberOption
	for rows.Next() {
		var m models.SharedShelfMemberOption
		if err := rows.Scan(&m.UserID, &m.Username, &m.DisplayName); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *PostgresAccountDeletionRepository) TransferShelfOwnershipTx(ctx context.Context, tx pgx.Tx, kind ShelfKind, shelfID string, fromOwner, toOwner int64) error {
	k := string(kind)
	var tag int64
	switch kind {
	case ShelfKindCollection:
		err := tx.QueryRow(ctx, `
			UPDATE collections SET user_id = $3, updated_at = NOW()
			WHERE id = $2::uuid AND user_id = $1
			RETURNING 1
		`, fromOwner, shelfID, toOwner).Scan(&tag)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidOwnershipTransfer
		}
		if err != nil {
			return err
		}
	case ShelfKindList:
		err := tx.QueryRow(ctx, `
			UPDATE lists SET user_id = $3, updated_at = NOW()
			WHERE id = $2::uuid AND user_id = $1
			RETURNING 1
		`, fromOwner, shelfID, toOwner).Scan(&tag)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidOwnershipTransfer
		}
		if err != nil {
			return err
		}
	case ShelfKindWishlist:
		err := tx.QueryRow(ctx, `
			UPDATE wishlists SET user_id = $3, updated_at = NOW()
			WHERE id = $2::uuid AND user_id = $1
			RETURNING 1
		`, fromOwner, shelfID, toOwner).Scan(&tag)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidOwnershipTransfer
		}
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("invalid shelf kind")
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO shelf_members (shelf_kind, shelf_id, user_id) VALUES ($1, $2::uuid, $3)
		ON CONFLICT (shelf_kind, shelf_id, user_id) DO NOTHING
	`, k, shelfID, toOwner)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		DELETE FROM shelf_members WHERE shelf_kind = $1 AND shelf_id = $2::uuid AND user_id = $3
	`, k, shelfID, fromOwner)
	return err
}

func (r *PostgresAccountDeletionRepository) DeactivateUserTx(ctx context.Context, tx pgx.Tx, userID int64, purgeAt time.Time) error {
	tag, err := tx.Exec(ctx, `
		UPDATE users
		SET account_status = 'deactivated', deactivated_at = NOW(), purge_scheduled_at = $2, updated_at = NOW()
		WHERE id = $1 AND account_status = 'active'
	`, userID, purgeAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAccountNotActive
	}
	return nil
}

func (r *PostgresAccountDeletionRepository) InsertReactivationTokenTx(ctx context.Context, tx pgx.Tx, userID int64, tokenHash string, expiresAt time.Time) error {
	_, err := tx.Exec(ctx, `DELETE FROM account_reactivation_tokens WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO account_reactivation_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
	`, userID, tokenHash, expiresAt)
	return err
}

func (r *PostgresAccountDeletionRepository) InsertSuccessionTx(ctx context.Context, tx pgx.Tx, kind ShelfKind, shelfID string, outgoingOwner int64, mode string) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		INSERT INTO shelf_ownership_successions (shelf_kind, shelf_id, outgoing_owner_id, mode)
		VALUES ($1, $2::uuid, $3, $4)
		RETURNING id
	`, string(kind), shelfID, outgoingOwner, mode).Scan(&id)
	return id, err
}

func (r *PostgresAccountDeletionRepository) CancelSuccessionsForOwnerTx(ctx context.Context, tx pgx.Tx, ownerID int64) error {
	_, err := tx.Exec(ctx, `
		UPDATE shelf_ownership_successions
		SET status = 'cancelled', resolved_at = NOW()
		WHERE outgoing_owner_id = $1 AND status = 'pending'
	`, ownerID)
	return err
}

func (r *PostgresAccountDeletionRepository) ReactivateUserByID(ctx context.Context, userID int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tag, err := tx.Exec(ctx, `
		UPDATE users
		SET account_status = 'active', deactivated_at = NULL, purge_scheduled_at = NULL, updated_at = NOW()
		WHERE id = $1 AND account_status = 'deactivated'
	`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	if err := r.CancelSuccessionsForOwnerTx(ctx, tx, userID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM account_reactivation_tokens WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PostgresAccountDeletionRepository) UserIDByReactivationTokenHash(ctx context.Context, tokenHash string) (int64, error) {
	var uid int64
	err := r.pool.QueryRow(ctx, `
		SELECT user_id FROM account_reactivation_tokens
		WHERE token_hash = $1 AND expires_at > NOW()
	`, tokenHash).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrUserNotFound
	}
	return uid, err
}

func (r *PostgresAccountDeletionRepository) ListUsersDueForPurge(ctx context.Context, limit int) ([]int64, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id FROM users
		WHERE account_status = 'deactivated' AND purge_scheduled_at IS NOT NULL AND purge_scheduled_at <= NOW()
		ORDER BY purge_scheduled_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *PostgresAccountDeletionRepository) PurgeUserContent(ctx context.Context, userID int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `DELETE FROM collections WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM wishlists WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM lists WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE shelf_ownership_successions SET status = 'cancelled', resolved_at = NOW()
		WHERE outgoing_owner_id = $1 AND status = 'pending'
	`, userID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM user_custom_themes WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE published_custom_themes
		SET author_user_id = NULL,
		    author_display_name = '[deleted]',
		    author_profile_url = NULL,
		    author_deleted = TRUE
		WHERE author_user_id = $1
	`, userID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type SuccessionRow struct {
	ID              int64
	ShelfKind       ShelfKind
	ShelfID         string
	Mode            string
	Status          string
	OutgoingOwnerID int64
	NewOwnerID      *int64
}

func (r *PostgresAccountDeletionRepository) GetSuccessionForActor(ctx context.Context, successionID, actorID int64) (*SuccessionRow, error) {
	var row SuccessionRow
	var kindStr string
	var newOwner *int64
	err := r.pool.QueryRow(ctx, `
		SELECT id, shelf_kind, shelf_id::text, mode, status, outgoing_owner_id, new_owner_id
		FROM shelf_ownership_successions WHERE id = $1
	`, successionID).Scan(&row.ID, &kindStr, &row.ShelfID, &row.Mode, &row.Status, &row.OutgoingOwnerID, &newOwner)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSuccessionNotFound
	}
	if err != nil {
		return nil, err
	}
	k, err := ParseShelfKind(kindStr)
	if err != nil {
		return nil, err
	}
	row.ShelfKind = k
	row.NewOwnerID = newOwner
	member, err := r.IsActiveMember(ctx, row.ShelfKind, row.ShelfID, actorID)
	if err != nil {
		return nil, err
	}
	if row.OutgoingOwnerID == actorID || !member {
		return nil, ErrSuccessionNotEligible
	}
	return &row, nil
}

func (r *PostgresAccountDeletionRepository) IsActiveMember(ctx context.Context, kind ShelfKind, shelfID string, userID int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM shelf_members sm
			JOIN users u ON u.id = sm.user_id
			WHERE sm.shelf_kind = $1 AND sm.shelf_id = $2::uuid AND sm.user_id = $3
			  AND u.account_status = 'active'
		)
	`, string(kind), shelfID, userID).Scan(&ok)
	return ok, err
}

func (r *PostgresAccountDeletionRepository) ResolveSuccessionTakeover(ctx context.Context, successionID, actorID int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var row SuccessionRow
	var kindStr string
	err = tx.QueryRow(ctx, `
		SELECT id, shelf_kind, shelf_id::text, mode, status, outgoing_owner_id
		FROM shelf_ownership_successions WHERE id = $1 FOR UPDATE
	`, successionID).Scan(&row.ID, &kindStr, &row.ShelfID, &row.Mode, &row.Status, &row.OutgoingOwnerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrSuccessionNotFound
	}
	if err != nil {
		return err
	}
	if row.Status != "pending" {
		return ErrSuccessionNotPending
	}
	if row.Mode != "sole_takeover" {
		return ErrSuccessionNotEligible
	}
	kind, err := ParseShelfKind(kindStr)
	if err != nil {
		return err
	}
	member, err := r.isActiveMemberTx(ctx, tx, kind, row.ShelfID, actorID)
	if err != nil {
		return err
	}
	if !member {
		return ErrSuccessionNotEligible
	}
	if err := r.TransferShelfOwnershipTx(ctx, tx, kind, row.ShelfID, row.OutgoingOwnerID, actorID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE shelf_ownership_successions
		SET status = 'resolved', new_owner_id = $2, resolved_at = NOW()
		WHERE id = $1
	`, successionID, actorID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PostgresAccountDeletionRepository) CastElectionVote(ctx context.Context, successionID, voterID, candidateID int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var row SuccessionRow
	var kindStr string
	err = tx.QueryRow(ctx, `
		SELECT id, shelf_kind, shelf_id::text, mode, status, outgoing_owner_id
		FROM shelf_ownership_successions WHERE id = $1 FOR UPDATE
	`, successionID).Scan(&row.ID, &kindStr, &row.ShelfID, &row.Mode, &row.Status, &row.OutgoingOwnerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrSuccessionNotFound
	}
	if err != nil {
		return err
	}
	if row.Status != "pending" || row.Mode != "election" {
		return ErrSuccessionNotPending
	}
	kind, err := ParseShelfKind(kindStr)
	if err != nil {
		return err
	}
	voterMember, err := r.isActiveMemberTx(ctx, tx, kind, row.ShelfID, voterID)
	if err != nil {
		return err
	}
	if !voterMember {
		return ErrSuccessionNotEligible
	}
	candidateMember, err := r.isActiveMemberTx(ctx, tx, kind, row.ShelfID, candidateID)
	if err != nil {
		return err
	}
	if !candidateMember || candidateID == row.OutgoingOwnerID {
		return ErrSuccessionNotEligible
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO shelf_ownership_election_votes (succession_id, voter_id, candidate_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (succession_id, voter_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id
	`, successionID, voterID, candidateID)
	if err != nil {
		return err
	}

	var voterCount int
	err = tx.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM shelf_members sm
		JOIN users u ON u.id = sm.user_id
		WHERE sm.shelf_kind = $1 AND sm.shelf_id = $2::uuid AND sm.user_id <> $3
		  AND u.account_status = 'active'
	`, string(kind), row.ShelfID, row.OutgoingOwnerID).Scan(&voterCount)
	if err != nil {
		return err
	}
	var unanimousCandidate *int64
	err = tx.QueryRow(ctx, `
		SELECT candidate_id FROM shelf_ownership_election_votes
		WHERE succession_id = $1
		GROUP BY candidate_id
		HAVING COUNT(*) = $2
		LIMIT 1
	`, successionID, voterCount).Scan(&unanimousCandidate)
	if errors.Is(err, pgx.ErrNoRows) {
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	var voteCount int
	err = tx.QueryRow(ctx, `SELECT COUNT(*)::int FROM shelf_ownership_election_votes WHERE succession_id = $1`, successionID).Scan(&voteCount)
	if err != nil {
		return err
	}
	if voteCount < voterCount {
		return tx.Commit(ctx)
	}
	if err := r.TransferShelfOwnershipTx(ctx, tx, kind, row.ShelfID, row.OutgoingOwnerID, *unanimousCandidate); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE shelf_ownership_successions
		SET status = 'resolved', new_owner_id = $2, resolved_at = NOW()
		WHERE id = $1
	`, successionID, *unanimousCandidate)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PostgresAccountDeletionRepository) isActiveMemberTx(ctx context.Context, tx pgx.Tx, kind ShelfKind, shelfID string, userID int64) (bool, error) {
	var ok bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM shelf_members sm
			JOIN users u ON u.id = sm.user_id
			WHERE sm.shelf_kind = $1 AND sm.shelf_id = $2::uuid AND sm.user_id = $3
			  AND u.account_status = 'active'
		)
	`, string(kind), shelfID, userID).Scan(&ok)
	return ok, err
}

func (r *PostgresAccountDeletionRepository) ResolvePendingSuccessionsForPurge(ctx context.Context, outgoingOwnerID int64) error {
	rows, err := r.pool.Query(ctx, `
		SELECT id, shelf_kind, shelf_id::text, mode
		FROM shelf_ownership_successions
		WHERE outgoing_owner_id = $1 AND status = 'pending'
	`, outgoingOwnerID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var kindStr, shelfID, mode string
		if err := rows.Scan(&id, &kindStr, &shelfID, &mode); err != nil {
			return err
		}
		kind, err := ParseShelfKind(kindStr)
		if err != nil {
			return err
		}
		if err := r.autoResolveSuccession(ctx, id, kind, shelfID, outgoingOwnerID); err != nil {
			return err
		}
	}
	return rows.Err()
}

func (r *PostgresAccountDeletionRepository) autoResolveSuccession(ctx context.Context, successionID int64, kind ShelfKind, shelfID string, outgoingOwner int64) error {
	members, err := r.listShelfMembers(ctx, string(kind), shelfID, outgoingOwner)
	if err != nil {
		return err
	}
	if len(members) == 0 {
		_, err = r.pool.Exec(ctx, `
			UPDATE shelf_ownership_successions SET status = 'cancelled', resolved_at = NOW() WHERE id = $1
		`, successionID)
		return err
	}
	newOwner := members[0].UserID
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := r.TransferShelfOwnershipTx(ctx, tx, kind, shelfID, outgoingOwner, newOwner); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE shelf_ownership_successions SET status = 'resolved', new_owner_id = $2, resolved_at = NOW() WHERE id = $1
	`, successionID, newOwner)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
