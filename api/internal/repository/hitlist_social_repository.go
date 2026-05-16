package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrHitlistCommentNotFound = errors.New("comment not found")

type PostgresHitlistSocialRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresHitlistSocialRepository(pool *pgxpool.Pool) *PostgresHitlistSocialRepository {
	return &PostgresHitlistSocialRepository{pool: pool}
}

func (r *PostgresHitlistSocialRepository) VoteUpsert(ctx context.Context, listID string, userID int64) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO hitlist_votes (list_id, user_id) VALUES ($1::uuid, $2)
		ON CONFLICT (list_id, user_id) DO NOTHING
	`, listID, userID)
	if err != nil {
		return fmt.Errorf("hitlist vote: %w", err)
	}
	return nil
}

func (r *PostgresHitlistSocialRepository) VoteDelete(ctx context.Context, listID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM hitlist_votes WHERE list_id = $1::uuid AND user_id = $2
	`, listID, userID)
	if err != nil {
		return fmt.Errorf("hitlist unvote: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("no vote to remove")
	}
	return nil
}

func (r *PostgresHitlistSocialRepository) VoteStats(ctx context.Context, listID string, viewer *int64) (count int64, viewerVoted bool, err error) {
	err = r.pool.QueryRow(ctx, `SELECT COUNT(*)::bigint FROM hitlist_votes WHERE list_id = $1::uuid`, listID).Scan(&count)
	if err != nil {
		return 0, false, fmt.Errorf("hitlist vote count: %w", err)
	}
	if viewer != nil {
		var n int64
		err = r.pool.QueryRow(ctx, `
			SELECT COUNT(*)::bigint FROM hitlist_votes WHERE list_id = $1::uuid AND user_id = $2
		`, listID, *viewer).Scan(&n)
		if err != nil {
			return count, false, fmt.Errorf("hitlist viewer vote: %w", err)
		}
		viewerVoted = n > 0
	}
	return count, viewerVoted, nil
}

const hitlistCommentAuthorCols = "u.username, u.display_name, u.avatar_url"

func scanHitlistCommentRow(sc interface {
	Scan(dest ...any) error
}) (models.HitlistComment, error) {
	var c models.HitlistComment
	var auUser, auDn, auAv sql.NullString
	if err := sc.Scan(&c.ID, &c.ListID, &c.UserID, &c.Body, &c.CreatedAt, &c.UpdatedAt, &auUser, &auDn, &auAv); err != nil {
		return c, err
	}
	c.Author = shelfAuthorPtr(auUser, auDn, auAv)
	return c, nil
}

func (r *PostgresHitlistSocialRepository) ListComments(ctx context.Context, listID string, limit int) ([]models.HitlistComment, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.list_id, c.user_id, c.body, c.created_at, c.updated_at,
		       `+hitlistCommentAuthorCols+`
		FROM hitlist_comments c
		INNER JOIN users u ON u.id = c.user_id
		WHERE c.list_id = $1::uuid
		ORDER BY c.created_at ASC
		LIMIT $2
	`, listID, limit)
	if err != nil {
		return nil, fmt.Errorf("list hitlist comments: %w", err)
	}
	defer rows.Close()
	out := make([]models.HitlistComment, 0)
	for rows.Next() {
		cm, err := scanHitlistCommentRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, cm)
	}
	return out, rows.Err()
}

func (r *PostgresHitlistSocialRepository) InsertComment(ctx context.Context, listID string, userID int64, body string) (*models.HitlistComment, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, fmt.Errorf("body required")
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO hitlist_comments (list_id, user_id, body)
		VALUES ($1::uuid, $2, $3)
		RETURNING id, list_id, user_id, body, created_at, updated_at,
		          (SELECT username FROM users u WHERE u.id = $2),
		          (SELECT display_name FROM users u WHERE u.id = $2),
		          (SELECT avatar_url FROM users u WHERE u.id = $2)
	`, listID, userID, body)
	var c models.HitlistComment
	var auUser, auDn, auAv sql.NullString
	if err := row.Scan(&c.ID, &c.ListID, &c.UserID, &c.Body, &c.CreatedAt, &c.UpdatedAt, &auUser, &auDn, &auAv); err != nil {
		return nil, fmt.Errorf("insert comment: %w", err)
	}
	c.Author = shelfAuthorPtr(auUser, auDn, auAv)
	return &c, nil
}

func (r *PostgresHitlistSocialRepository) DeleteCommentIfAuthorOrListOwner(ctx context.Context, listID, commentID string, actorUserID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM hitlist_comments c
		USING lists l
		WHERE c.id = $1::uuid AND c.list_id = $2::uuid AND c.list_id = l.id
		  AND (c.user_id = $3 OR l.user_id = $3)
	`, commentID, listID, actorUserID)
	if err != nil {
		return fmt.Errorf("delete comment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrHitlistCommentNotFound
	}
	return nil
}
