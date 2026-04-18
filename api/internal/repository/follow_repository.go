package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrCannotFollowSelf = errors.New("cannot follow yourself")

type PostgresFollowRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresFollowRepository(pool *pgxpool.Pool) *PostgresFollowRepository {
	return &PostgresFollowRepository{pool: pool}
}

func (r *PostgresFollowRepository) Follow(ctx context.Context, followerID, followingID int64) error {
	if followerID == followingID {
		return ErrCannotFollowSelf
	}
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, followerID, followingID)
	if err != nil {
		return fmt.Errorf("follow: %w", err)
	}
	_ = tag
	return nil
}

func (r *PostgresFollowRepository) Unfollow(ctx context.Context, followerID, followingID int64) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2
	`, followerID, followingID)
	if err != nil {
		return fmt.Errorf("unfollow: %w", err)
	}
	return nil
}

func (r *PostgresFollowRepository) IsFollowing(ctx context.Context, followerID, followingID int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2)
	`, followerID, followingID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("is following: %w", err)
	}
	return ok, nil
}

func (r *PostgresFollowRepository) FollowerCount(ctx context.Context, userID int64) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM user_follows WHERE following_id = $1`, userID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("follower count: %w", err)
	}
	return n, nil
}

func (r *PostgresFollowRepository) FollowingCount(ctx context.Context, userID int64) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM user_follows WHERE follower_id = $1`, userID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("following count: %w", err)
	}
	return n, nil
}

func (r *PostgresFollowRepository) ListFollowers(ctx context.Context, userID int64, limit, offset int) ([]models.PublicUser, int64, error) {
	if limit <= 0 || limit > 48 {
		limit = 24
	}
	if offset < 0 {
		offset = 0
	}
	var total int64
	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM user_follows WHERE following_id = $1
	`, userID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count followers: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT u.id, u.username, u.display_name, u.first_name, u.last_name, u.first_name_public, u.last_name_public,
			u.location, u.bio, u.avatar_url, u.banner_url, u.social_links, u.created_at
		FROM user_follows f
		JOIN users u ON u.id = f.follower_id
		WHERE f.following_id = $1
		ORDER BY f.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list followers: %w", err)
	}
	defer rows.Close()
	return scanPublicUserRows(rows, total)
}

func (r *PostgresFollowRepository) ListFollowing(ctx context.Context, userID int64, limit, offset int) ([]models.PublicUser, int64, error) {
	if limit <= 0 || limit > 48 {
		limit = 24
	}
	if offset < 0 {
		offset = 0
	}
	var total int64
	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM user_follows WHERE follower_id = $1
	`, userID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count following: %w", err)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT u.id, u.username, u.display_name, u.first_name, u.last_name, u.first_name_public, u.last_name_public,
			u.location, u.bio, u.avatar_url, u.banner_url, u.social_links, u.created_at
		FROM user_follows f
		JOIN users u ON u.id = f.following_id
		WHERE f.follower_id = $1
		ORDER BY f.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list following: %w", err)
	}
	defer rows.Close()
	return scanPublicUserRows(rows, total)
}

func scanPublicUserRows(rows pgx.Rows, total int64) ([]models.PublicUser, int64, error) {
	out := make([]models.PublicUser, 0)
	for rows.Next() {
		var u models.PublicUser
		var sl []byte
		var fn, ln string
		var fnPub, lnPub bool
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &fn, &ln, &fnPub, &lnPub, &u.Location, &u.Bio, &u.AvatarURL, &u.BannerURL, &sl, &u.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		u.SocialLinks = sl
		models.RedactPublicNames(&u, fn, ln, fnPub, lnPub, false)
		out = append(out, u)
	}
	return out, total, rows.Err()
}
