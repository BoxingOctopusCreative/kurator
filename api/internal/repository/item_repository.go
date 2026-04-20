package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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
	Create(ctx context.Context, collectionID int64, title string, category models.Category, metadata json.RawMessage, rating *int) (*models.Item, error)
	Update(ctx context.Context, id int64, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, newCollectionID *int64) (*models.Item, error)
	Delete(ctx context.Context, id int64) error
}

type PostgresItemRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresItemRepository(pool *pgxpool.Pool) *PostgresItemRepository {
	return &PostgresItemRepository{pool: pool}
}

func ratingPtrFromNull(n sql.NullInt32) *int {
	if !n.Valid {
		return nil
	}
	v := int(n.Int32)
	return &v
}

func selectItemColumns(withRating bool) string {
	if withRating {
		return "id, collection_id, title, category, metadata, rating, created_at, updated_at"
	}
	return "id, collection_id, title, category, metadata, created_at, updated_at"
}

func selectItemColumnsAliased(alias string, withRating bool) string {
	a := func(c string) string { return alias + "." + c }
	s := strings.Join([]string{a("id"), a("collection_id"), a("title"), a("category"), a("metadata")}, ", ")
	if withRating {
		return s + ", " + a("rating") + ", " + a("created_at") + ", " + a("updated_at")
	}
	return s + ", " + a("created_at") + ", " + a("updated_at")
}

func scanItemRow(scan func(dest ...any) error, withRating bool) (models.Item, error) {
	var it models.Item
	var rating sql.NullInt32
	var err error
	if withRating {
		err = scan(&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &rating, &it.CreatedAt, &it.UpdatedAt)
		if err != nil {
			return it, err
		}
		it.Rating = ratingPtrFromNull(rating)
		return it, nil
	}
	err = scan(&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt)
	return it, err
}

func (r *PostgresItemRepository) ListLatest(ctx context.Context, limit int) ([]models.Item, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}
	cols := selectItemColumns(withR)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM items
		ORDER BY created_at DESC
		LIMIT $1
	`, cols), limit)
	if err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}
	defer rows.Close()

	// Non-nil empty slice so JSON is [] not null (clients expect an array).
	out := make([]models.Item, 0)
	for rows.Next() {
		it, err := scanItemRow(rows.Scan, withR)
		if err != nil {
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
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items by collection: %w", err)
	}
	cols := selectItemColumns(withR)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM items
		WHERE collection_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, cols), collectionID, limit)
	if err != nil {
		return nil, fmt.Errorf("list items by collection: %w", err)
	}
	defer rows.Close()

	out := make([]models.Item, 0)
	for rows.Next() {
		it, err := scanItemRow(rows.Scan, withR)
		if err != nil {
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
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items for export: %w", err)
	}
	cols := selectItemColumns(withR)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM items
		WHERE collection_id = $1
		ORDER BY id ASC
		LIMIT $2
	`, cols), collectionID, max)
	if err != nil {
		return nil, fmt.Errorf("list items for export: %w", err)
	}
	defer rows.Close()

	out := make([]models.Item, 0)
	for rows.Next() {
		it, err := scanItemRow(rows.Scan, withR)
		if err != nil {
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
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items for owner: %w", err)
	}
	cols := selectItemColumnsAliased("i", withR)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM items i
		INNER JOIN collections c ON c.id = i.collection_id
		WHERE c.user_id = $1
		ORDER BY i.created_at DESC
		LIMIT $2
	`, cols), ownerUserID, limit)
	if err != nil {
		return nil, fmt.Errorf("list items for owner: %w", err)
	}
	defer rows.Close()
	out := make([]models.Item, 0)
	for rows.Next() {
		it, err := scanItemRow(rows.Scan, withR)
		if err != nil {
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
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items from followed users: %w", err)
	}
	cols := selectItemColumnsAliased("i", withR)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM items i
		INNER JOIN collections c ON c.id = i.collection_id
		WHERE c.user_id IS NOT NULL
		  AND c.is_public = TRUE
		  AND c.user_id <> $1
		  AND c.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1)
		ORDER BY i.created_at DESC
		LIMIT $2
	`, cols), followerUserID, limit)
	if err != nil {
		return nil, fmt.Errorf("list items from followed users: %w", err)
	}
	defer rows.Close()
	out := make([]models.Item, 0)
	for rows.Next() {
		it, err := scanItemRow(rows.Scan, withR)
		if err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *PostgresItemRepository) GetByID(ctx context.Context, id int64) (*models.Item, error) {
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("get item: %w", err)
	}
	cols := selectItemColumns(withR)
	row := r.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT %s
		FROM items WHERE id = $1
	`, cols), id)
	it, err := scanItemRow(row.Scan, withR)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrItemNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get item: %w", err)
	}
	return &it, nil
}

func (r *PostgresItemRepository) Create(ctx context.Context, collectionID int64, title string, category models.Category, metadata json.RawMessage, rating *int) (*models.Item, error) {
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("create item: %w", err)
	}
	cols := selectItemColumns(withR)
	var it models.Item
	if withR {
		var ratingOut sql.NullInt32
		err = r.pool.QueryRow(ctx, `
			INSERT INTO items (collection_id, title, category, metadata, rating)
			VALUES ($1, $2, $3, $4::jsonb, $5)
			RETURNING `+cols+`
		`, collectionID, title, string(category), string(metadata), rating).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &ratingOut, &it.CreatedAt, &it.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("create item: %w", err)
		}
		it.Rating = ratingPtrFromNull(ratingOut)
		return &it, nil
	}
	err = r.pool.QueryRow(ctx, `
		INSERT INTO items (collection_id, title, category, metadata)
		VALUES ($1, $2, $3, $4::jsonb)
		RETURNING `+cols+`
	`, collectionID, title, string(category), string(metadata)).Scan(
		&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create item: %w", err)
	}
	return &it, nil
}

func (r *PostgresItemRepository) Update(ctx context.Context, id int64, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, newCollectionID *int64) (*models.Item, error) {
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("update item: %w", err)
	}
	cols := selectItemColumns(withR)

	args := []interface{}{id, title, string(category), string(metadata)}
	setParts := []string{"title = $2", "category = $3", "metadata = $4::jsonb"}
	next := 5
	if newCollectionID != nil {
		setParts = append(setParts, fmt.Sprintf("collection_id = $%d", next))
		args = append(args, *newCollectionID)
		next++
	}
	if withR {
		if rating != nil {
			if rating.SetNull {
				setParts = append(setParts, "rating = NULL")
			} else {
				setParts = append(setParts, fmt.Sprintf("rating = $%d", next))
				args = append(args, rating.Stars)
				next++
			}
		}
	}
	setParts = append(setParts, "updated_at = NOW()")
	q := fmt.Sprintf(`UPDATE items SET %s WHERE id = $1 RETURNING %s`, strings.Join(setParts, ", "), cols)

	var it models.Item
	if withR {
		var ratingOut sql.NullInt32
		err = r.pool.QueryRow(ctx, q, args...).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &ratingOut, &it.CreatedAt, &it.UpdatedAt,
		)
		if err == nil {
			it.Rating = ratingPtrFromNull(ratingOut)
		}
	} else {
		err = r.pool.QueryRow(ctx, q, args...).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt,
		)
	}
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
