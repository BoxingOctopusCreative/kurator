package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrItemNotFound = errors.New("item not found")

type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type ItemRepository interface {
	ListLatest(ctx context.Context, limit int) ([]models.Item, error)
	// ListByCollection lists items; consumptionFilter is "", "pending", or "done" (ignored when the column is absent).
	ListByCollection(ctx context.Context, collectionID string, limit int, consumptionFilter string) ([]models.Item, error)
	// ListByCollectionExport returns items in stable id order for CSV export (capped).
	ListByCollectionExport(ctx context.Context, collectionID string, max int) ([]models.Item, error)
	ListRecentForOwner(ctx context.Context, ownerUserID int64, limit int) ([]models.Item, error)
	ListRecentFromFollowedUsers(ctx context.Context, followerUserID int64, limit int) ([]models.Item, error)
	GetByID(ctx context.Context, id string) (*models.Item, error)
	Create(ctx context.Context, collectionID string, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error)
	CreateTx(ctx context.Context, tx pgx.Tx, collectionID string, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error)
	Update(ctx context.Context, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error)
	UpdateTx(ctx context.Context, tx pgx.Tx, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error)
	Delete(ctx context.Context, id string) error
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

func selectItemColumns(withRating, withConsumption bool) string {
	s := "id, collection_id, title, category, metadata"
	if withRating {
		s += ", rating"
	}
	if withConsumption {
		s += ", consumption_status"
	}
	return s + ", created_at, updated_at"
}

func selectItemColumnsAliased(alias string, withRating, withConsumption bool) string {
	a := func(c string) string { return alias + "." + c }
	parts := []string{a("id"), a("collection_id"), a("title"), a("category"), a("metadata")}
	if withRating {
		parts = append(parts, a("rating"))
	}
	if withConsumption {
		parts = append(parts, a("consumption_status"))
	}
	parts = append(parts, a("created_at"), a("updated_at"))
	return strings.Join(parts, ", ")
}

func scanItemRow(scan func(dest ...any) error, withRating, withConsumption bool) (models.Item, error) {
	var it models.Item
	var rating sql.NullInt32
	var consumption sql.NullString
	var err error
	dest := []any{&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata}
	if withRating {
		dest = append(dest, &rating)
	}
	if withConsumption {
		dest = append(dest, &consumption)
	}
	dest = append(dest, &it.CreatedAt, &it.UpdatedAt)
	err = scan(dest...)
	if err != nil {
		return it, err
	}
	if withRating {
		it.Rating = ratingPtrFromNull(rating)
	}
	if withConsumption && consumption.Valid {
		it.ConsumptionStatus = models.ConsumptionStatus(consumption.String)
	}
	return it, nil
}

func (r *PostgresItemRepository) ListLatest(ctx context.Context, limit int) ([]models.Item, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}
	cols := selectItemColumns(withR, withC)
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
		it, err := scanItemRow(rows.Scan, withR, withC)
		if err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *PostgresItemRepository) ListByCollection(ctx context.Context, collectionID string, limit int, consumptionFilter string) ([]models.Item, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items by collection: %w", err)
	}
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items by collection: %w", err)
	}
	cols := selectItemColumns(withR, withC)
	where := "collection_id = $1"
	args := []interface{}{collectionID}
	nextArg := 2
	if withC && (consumptionFilter == "pending" || consumptionFilter == "done") {
		where += fmt.Sprintf(" AND consumption_status = $%d", nextArg)
		args = append(args, consumptionFilter)
		nextArg++
	}
	args = append(args, limit)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM items
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d
	`, cols, where, nextArg), args...)
	if err != nil {
		return nil, fmt.Errorf("list items by collection: %w", err)
	}
	defer rows.Close()

	out := make([]models.Item, 0)
	for rows.Next() {
		it, err := scanItemRow(rows.Scan, withR, withC)
		if err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *PostgresItemRepository) ListByCollectionExport(ctx context.Context, collectionID string, max int) ([]models.Item, error) {
	if max <= 0 || max > 50000 {
		max = 50000
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items for export: %w", err)
	}
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items for export: %w", err)
	}
	cols := selectItemColumns(withR, withC)
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
		it, err := scanItemRow(rows.Scan, withR, withC)
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
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items for owner: %w", err)
	}
	cols := selectItemColumnsAliased("i", withR, withC)
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
		it, err := scanItemRow(rows.Scan, withR, withC)
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
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items from followed users: %w", err)
	}
	cols := selectItemColumnsAliased("i", withR, withC)
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
		it, err := scanItemRow(rows.Scan, withR, withC)
		if err != nil {
			return nil, fmt.Errorf("scan item: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *PostgresItemRepository) GetByID(ctx context.Context, id string) (*models.Item, error) {
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("get item: %w", err)
	}
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("get item: %w", err)
	}
	cols := selectItemColumns(withR, withC)
	row := r.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT %s
		FROM items WHERE id = $1
	`, cols), id)
	it, err := scanItemRow(row.Scan, withR, withC)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrItemNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get item: %w", err)
	}
	return &it, nil
}

func (r *PostgresItemRepository) Create(ctx context.Context, collectionID string, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error) {
	return r.createUsing(ctx, r.pool, collectionID, title, category, metadata, rating, consumption)
}

func (r *PostgresItemRepository) CreateTx(ctx context.Context, tx pgx.Tx, collectionID string, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error) {
	return r.createUsing(ctx, tx, collectionID, title, category, metadata, rating, consumption)
}

func (r *PostgresItemRepository) createUsing(ctx context.Context, db rowQuerier, collectionID string, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error) {
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("create item: %w", err)
	}
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("create item: %w", err)
	}
	cols := selectItemColumns(withR, withC)
	var it models.Item
	cs := models.ConsumptionPending
	if consumption != nil && (*consumption).Valid() {
		cs = *consumption
	}

	switch {
	case withR && withC:
		var ratingOut sql.NullInt32
		var consOut sql.NullString
		err = db.QueryRow(ctx, `
			INSERT INTO items (collection_id, title, category, metadata, rating, consumption_status)
			VALUES ($1, $2, $3, $4::jsonb, $5, $6)
			RETURNING `+cols+`
		`, collectionID, title, string(category), string(metadata), rating, string(cs)).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &ratingOut, &consOut, &it.CreatedAt, &it.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("create item: %w", err)
		}
		it.Rating = ratingPtrFromNull(ratingOut)
		if consOut.Valid {
			it.ConsumptionStatus = models.ConsumptionStatus(consOut.String)
		}
		return &it, nil
	case withR && !withC:
		var ratingOut sql.NullInt32
		err = db.QueryRow(ctx, `
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
	case !withR && withC:
		var consOut sql.NullString
		err = db.QueryRow(ctx, `
			INSERT INTO items (collection_id, title, category, metadata, consumption_status)
			VALUES ($1, $2, $3, $4::jsonb, $5)
			RETURNING `+cols+`
		`, collectionID, title, string(category), string(metadata), string(cs)).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &consOut, &it.CreatedAt, &it.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("create item: %w", err)
		}
		if consOut.Valid {
			it.ConsumptionStatus = models.ConsumptionStatus(consOut.String)
		}
		return &it, nil
	default:
		err = db.QueryRow(ctx, `
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
}

func (r *PostgresItemRepository) Update(ctx context.Context, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error) {
	return r.updateUsing(ctx, r.pool, id, title, category, metadata, rating, consumption, newCollectionID)
}

func (r *PostgresItemRepository) UpdateTx(ctx context.Context, tx pgx.Tx, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error) {
	return r.updateUsing(ctx, tx, id, title, category, metadata, rating, consumption, newCollectionID)
}

func (r *PostgresItemRepository) updateUsing(ctx context.Context, db rowQuerier, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error) {
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("update item: %w", err)
	}
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("update item: %w", err)
	}
	cols := selectItemColumns(withR, withC)

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
	if withC && consumption != nil {
		setParts = append(setParts, fmt.Sprintf("consumption_status = $%d", next))
		args = append(args, string(*consumption))
		next++
	}
	setParts = append(setParts, "updated_at = NOW()")
	q := fmt.Sprintf(`UPDATE items SET %s WHERE id = $1 RETURNING %s`, strings.Join(setParts, ", "), cols)

	var it models.Item
	switch {
	case withR && withC:
		var ratingOut sql.NullInt32
		var consOut sql.NullString
		err = db.QueryRow(ctx, q, args...).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &ratingOut, &consOut, &it.CreatedAt, &it.UpdatedAt,
		)
		if err == nil {
			it.Rating = ratingPtrFromNull(ratingOut)
			if consOut.Valid {
				it.ConsumptionStatus = models.ConsumptionStatus(consOut.String)
			}
		}
	case withR && !withC:
		var ratingOut sql.NullInt32
		err = db.QueryRow(ctx, q, args...).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &ratingOut, &it.CreatedAt, &it.UpdatedAt,
		)
		if err == nil {
			it.Rating = ratingPtrFromNull(ratingOut)
		}
	case !withR && withC:
		var consOut sql.NullString
		err = db.QueryRow(ctx, q, args...).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &consOut, &it.CreatedAt, &it.UpdatedAt,
		)
		if err == nil && consOut.Valid {
			it.ConsumptionStatus = models.ConsumptionStatus(consOut.String)
		}
	default:
		err = db.QueryRow(ctx, q, args...).Scan(
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

func (r *PostgresItemRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM items WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrItemNotFound
	}
	return nil
}

// CountByCollectionID returns how many items are on the shelf.
func (r *PostgresItemRepository) CountByCollectionID(ctx context.Context, collectionID string) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM items WHERE collection_id = $1::uuid`, collectionID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count items: %w", err)
	}
	return n, nil
}

// DistinctCategoriesByCollectionID returns unique item categories on a shelf (empty when no items).
func (r *PostgresItemRepository) DistinctCategoriesByCollectionID(ctx context.Context, collectionID string) ([]models.Category, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT category FROM items WHERE collection_id = $1::uuid ORDER BY category
	`, collectionID)
	if err != nil {
		return nil, fmt.Errorf("distinct categories: %w", err)
	}
	defer rows.Close()
	var out []models.Category
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		c := models.Category(strings.TrimSpace(s))
		if c.Valid() {
			out = append(out, c)
		}
	}
	return out, rows.Err()
}

// MoveAllItemsToCollectionTx reassigns every item from fromID to toID. Returns moved item ids.
func (r *PostgresItemRepository) MoveAllItemsToCollectionTx(ctx context.Context, tx pgx.Tx, fromID, toID string) ([]string, error) {
	rows, err := tx.Query(ctx, `
		UPDATE items SET collection_id = $1::uuid, updated_at = NOW()
		WHERE collection_id = $2::uuid
		RETURNING id::text
	`, toID, fromID)
	if err != nil {
		return nil, fmt.Errorf("move items: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// DeleteAllItemsInCollectionTx removes all items on a shelf; returns deleted ids for search cleanup.
func (r *PostgresItemRepository) DeleteAllItemsInCollectionTx(ctx context.Context, tx pgx.Tx, collectionID string) ([]string, error) {
	rows, err := tx.Query(ctx, `DELETE FROM items WHERE collection_id = $1::uuid RETURNING id::text`, collectionID)
	if err != nil {
		return nil, fmt.Errorf("delete items in collection: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListByIDs returns items for the given ids (stable order); skips invalid UUID strings.
func (r *PostgresItemRepository) ListByIDs(ctx context.Context, ids []string) ([]models.Item, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	uuids := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		u, err := uuid.Parse(strings.TrimSpace(id))
		if err != nil {
			continue
		}
		uuids = append(uuids, u)
	}
	if len(uuids) == 0 {
		return nil, nil
	}
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items by ids: %w", err)
	}
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list items by ids: %w", err)
	}
	cols := selectItemColumns(withR, withC)
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s FROM items WHERE id = ANY($1::uuid[])
		ORDER BY created_at ASC
	`, cols), uuids)
	if err != nil {
		return nil, fmt.Errorf("list items by ids: %w", err)
	}
	defer rows.Close()
	out := make([]models.Item, 0, len(uuids))
	for rows.Next() {
		it, err := scanItemRow(rows.Scan, withR, withC)
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}
