package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrItemNotFound = errors.New("item not found")

type ItemRepository interface {
	ListLatest(ctx context.Context, limit int) ([]models.Item, error)
	ListByCollection(ctx context.Context, collectionID int64, limit int) ([]models.Item, error)
	// ListByCollectionExport returns items in stable id order for CSV export (capped).
	ListByCollectionExport(ctx context.Context, collectionID int64, max int) ([]models.Item, error)
	ListRecentForOwner(ctx context.Context, ownerUserID int64, limit int) ([]models.Item, error)
	ListRecentFromFollowedUsers(ctx context.Context, followerUserID int64, limit int) ([]models.Item, error)
	GetByID(ctx context.Context, id int64) (*models.Item, error)
	Create(ctx context.Context, collectionID int64, title string, category models.Category, metadata json.RawMessage) (*models.Item, error)
	Update(ctx context.Context, id int64, title string, category models.Category, metadata json.RawMessage) (*models.Item, error)
	Delete(ctx context.Context, id int64) error
}

type PostgresItemRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresItemRepository(pool *pgxpool.Pool) *PostgresItemRepository {
	return &PostgresItemRepository{pool: pool}
}

func (r *PostgresItemRepository) ListLatest(ctx context.Context, limit int) ([]models.Item, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, collection_id, title, category, metadata, created_at, updated_at
		FROM items
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}
	defer rows.Close()

	// Non-nil empty slice so JSON is [] not null (clients expect an array).
	out := make([]models.Item, 0)
	for rows.Next() {
		var it models.Item
		if err := rows.Scan(&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *PostgresItemRepository) ListByCollection(ctx context.Context, collectionID int64, limit int) ([]models.Item, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, collection_id, title, category, metadata, created_at, updated_at
		FROM items
		WHERE collection_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, collectionID, limit)
	if err != nil {
		return nil, fmt.Errorf("list items by collection: %w", err)
	}
	defer rows.Close()

	out := make([]models.Item, 0)
	for rows.Next() {
		var it models.Item
		if err := rows.Scan(&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *PostgresItemRepository) ListByCollectionExport(ctx context.Context, collectionID int64, max int) ([]models.Item, error) {
	if max <= 0 || max > 50000 {
		max = 50000
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, collection_id, title, category, metadata, created_at, updated_at
		FROM items
		WHERE collection_id = $1
		ORDER BY id ASC
		LIMIT $2
	`, collectionID, max)
	if err != nil {
		return nil, fmt.Errorf("list items for export: %w", err)
	}
	defer rows.Close()

	out := make([]models.Item, 0)
	for rows.Next() {
		var it models.Item
		if err := rows.Scan(&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// ListRecentForOwner returns newest items in collections owned by ownerUserID (any visibility).
func (r *PostgresItemRepository) ListRecentForOwner(ctx context.Context, ownerUserID int64, limit int) ([]models.Item, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT i.id, i.collection_id, i.title, i.category, i.metadata, i.created_at, i.updated_at
		FROM items i
		INNER JOIN collections c ON c.id = i.collection_id
		WHERE c.user_id = $1
		ORDER BY i.created_at DESC
		LIMIT $2
	`, ownerUserID, limit)
	if err != nil {
		return nil, fmt.Errorf("list items for owner: %w", err)
	}
	defer rows.Close()
	out := make([]models.Item, 0)
	for rows.Next() {
		var it models.Item
		if err := rows.Scan(&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// ListRecentFromFollowedUsers returns newest items in public collections owned by users followerUserID follows (excludes self).
func (r *PostgresItemRepository) ListRecentFromFollowedUsers(ctx context.Context, followerUserID int64, limit int) ([]models.Item, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT i.id, i.collection_id, i.title, i.category, i.metadata, i.created_at, i.updated_at
		FROM items i
		INNER JOIN collections c ON c.id = i.collection_id
		WHERE c.user_id IS NOT NULL
		  AND c.is_public = TRUE
		  AND c.user_id <> $1
		  AND c.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1)
		ORDER BY i.created_at DESC
		LIMIT $2
	`, followerUserID, limit)
	if err != nil {
		return nil, fmt.Errorf("list items from followed users: %w", err)
	}
	defer rows.Close()
	out := make([]models.Item, 0)
	for rows.Next() {
		var it models.Item
		if err := rows.Scan(&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *PostgresItemRepository) GetByID(ctx context.Context, id int64) (*models.Item, error) {
	var it models.Item
	err := r.pool.QueryRow(ctx, `
		SELECT id, collection_id, title, category, metadata, created_at, updated_at
		FROM items WHERE id = $1
	`, id).Scan(&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrItemNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get item: %w", err)
	}
	return &it, nil
}

func (r *PostgresItemRepository) Create(ctx context.Context, collectionID int64, title string, category models.Category, metadata json.RawMessage) (*models.Item, error) {
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	var it models.Item
	err := r.pool.QueryRow(ctx, `
		INSERT INTO items (collection_id, title, category, metadata)
		VALUES ($1, $2, $3, $4::jsonb)
		RETURNING id, collection_id, title, category, metadata, created_at, updated_at
	`, collectionID, title, string(category), string(metadata)).Scan(
		&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create item: %w", err)
	}
	return &it, nil
}

func (r *PostgresItemRepository) Update(ctx context.Context, id int64, title string, category models.Category, metadata json.RawMessage) (*models.Item, error) {
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	var it models.Item
	err := r.pool.QueryRow(ctx, `
		UPDATE items
		SET title = $2, category = $3, metadata = $4::jsonb, updated_at = NOW()
		WHERE id = $1
		RETURNING id, collection_id, title, category, metadata, created_at, updated_at
	`, id, title, string(category), string(metadata)).Scan(
		&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrItemNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update item: %w", err)
	}
	return &it, nil
}

func (r *PostgresItemRepository) Delete(ctx context.Context, id int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM items WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrItemNotFound
	}
	return nil
}
