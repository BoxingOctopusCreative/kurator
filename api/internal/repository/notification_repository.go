package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotificationNotFound = errors.New("notification not found")

type PostgresNotificationRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresNotificationRepository(pool *pgxpool.Pool) *PostgresNotificationRepository {
	return &PostgresNotificationRepository{pool: pool}
}

// InsertFanout inserts one notification per follower of actorID who may see the activity
// under the given shelf visibility (private → no rows). Mirrors OwnedShelfVisibleToViewerSQL.
func (r *PostgresNotificationRepository) InsertFanout(
	ctx context.Context,
	actorID int64,
	visibility models.Visibility,
	kind string,
	payload json.RawMessage,
) error {
	if r == nil || r.pool == nil {
		return nil
	}
	if actorID < 1 || kind == "" {
		return nil
	}
	if visibility == models.VisibilityPrivate {
		return nil
	}
	if !visibility.Valid() {
		return nil
	}
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	visStr := string(visibility)
	_, err := r.pool.Exec(ctx, `
		INSERT INTO notifications (user_id, actor_id, kind, payload)
		SELECT f.follower_id, $1, $2, $4::jsonb
		FROM user_follows f
		WHERE f.following_id = $1
		  AND f.follower_id <> $1
		  AND (
		    $3::text = 'followers'
		    OR (
		      $3::text = 'friends' AND EXISTS (
		        SELECT 1 FROM user_follows m
		        WHERE m.follower_id = $1 AND m.following_id = f.follower_id
		      )
		    )
		  )
	`, actorID, kind, visStr, payload)
	if err != nil {
		return fmt.Errorf("notification fanout: %w", err)
	}
	return nil
}

// InsertOne inserts a single in-app notification: recipient user_id sees actor_id as the actor.
// Skips when recipient and actor are the same (matches DB CHECK).
func (r *PostgresNotificationRepository) InsertOne(
	ctx context.Context,
	recipientUserID, actorID int64,
	kind string,
	payload json.RawMessage,
) error {
	if r == nil || r.pool == nil {
		return nil
	}
	if recipientUserID < 1 || actorID < 1 || kind == "" {
		return nil
	}
	if recipientUserID == actorID {
		return nil
	}
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO notifications (user_id, actor_id, kind, payload)
		VALUES ($1, $2, $3, $4::jsonb)
	`, recipientUserID, actorID, kind, payload)
	if err != nil {
		return fmt.Errorf("insert notification: %w", err)
	}
	return nil
}

func (r *PostgresNotificationRepository) UnreadCount(ctx context.Context, userID int64) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL
	`, userID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("notification unread count: %w", err)
	}
	return n, nil
}

func (r *PostgresNotificationRepository) ListForUser(ctx context.Context, userID int64, limit, offset int) ([]models.NotificationFeedItem, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := r.pool.Query(ctx, `
		SELECT n.id, n.kind, n.payload, (n.read_at IS NOT NULL), n.created_at,
			u.id, u.username, u.display_name, u.first_name, u.last_name, u.first_name_public, u.last_name_public,
			u.location, u.bio, u.avatar_url, u.banner_url, u.social_links, u.created_at
		FROM notifications n
		JOIN users u ON u.id = n.actor_id
		WHERE n.user_id = $1
		ORDER BY n.created_at DESC, n.id DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()
	out := make([]models.NotificationFeedItem, 0)
	for rows.Next() {
		var it models.NotificationFeedItem
		var actor models.PublicUser
		var sl []byte
		var fn, ln string
		var fnPub, lnPub bool
		if err := rows.Scan(
			&it.ID, &it.Kind, &it.Payload, &it.Read, &it.CreatedAt,
			&actor.ID, &actor.Username, &actor.DisplayName, &fn, &ln, &fnPub, &lnPub,
			&actor.Location, &actor.Bio, &actor.AvatarURL, &actor.BannerURL, &sl, &actor.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}
		actor.SocialLinks = sl
		models.RedactPublicNames(&actor, fn, ln, fnPub, lnPub, false)
		it.Actor = actor
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *PostgresNotificationRepository) MarkRead(ctx context.Context, notificationID int64, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE notifications SET read_at = NOW()
		WHERE id = $1 AND user_id = $2 AND read_at IS NULL
	`, notificationID, userID)
	if err != nil {
		return fmt.Errorf("mark notification read: %w", err)
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		_ = r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM notifications WHERE id = $1 AND user_id = $2)`, notificationID, userID).Scan(&exists)
		if !exists {
			return ErrNotificationNotFound
		}
	}
	return nil
}

func (r *PostgresNotificationRepository) MarkAllRead(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE notifications SET read_at = NOW()
		WHERE user_id = $1 AND read_at IS NULL
	`, userID)
	if err != nil {
		return fmt.Errorf("mark all notifications read: %w", err)
	}
	return nil
}
