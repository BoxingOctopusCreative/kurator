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

var (
	ErrWishlistNotFound      = errors.New("wishlist not found")
	ErrWishlistEntryNotFound = errors.New("wishlist entry not found")
)

type PostgresWishlistRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresWishlistRepository(pool *pgxpool.Pool) *PostgresWishlistRepository {
	return &PostgresWishlistRepository{pool: pool}
}

// ListForViewer returns wishlists owned by the user or marked public (read-only for others' lists).
func (r *PostgresWishlistRepository) ListForViewer(ctx context.Context, viewerID int64) ([]models.Wishlist, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT w.id, w.user_id, w.name, w.description, w.target_collection_id, w.is_public, w.created_at, w.updated_at,
		       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
		WHERE w.user_id = $1 OR w.is_public = true
		GROUP BY w.id, w.user_id, w.name, w.description, w.target_collection_id, w.is_public, w.created_at, w.updated_at
		ORDER BY w.name ASC
	`, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list wishlists: %w", err)
	}
	defer rows.Close()

	out := make([]models.Wishlist, 0)
	for rows.Next() {
		w, err := scanWishlistRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func scanWishlistRow(row interface {
	Scan(dest ...any) error
}) (models.Wishlist, error) {
	var w models.Wishlist
	var desc sql.NullString
	var tgt sql.NullInt64
	if err := row.Scan(
		&w.ID, &w.UserID, &w.Name, &desc, &tgt, &w.IsPublic, &w.CreatedAt, &w.UpdatedAt, &w.EntryCount,
	); err != nil {
		return w, fmt.Errorf("scan wishlist: %w", err)
	}
	if desc.Valid {
		s := desc.String
		w.Description = &s
	}
	if tgt.Valid {
		v := tgt.Int64
		w.TargetCollectionID = &v
	}
	return w, nil
}

// GetByIDForUser returns a wishlist only if owned by userID.
func (r *PostgresWishlistRepository) GetByIDForUser(ctx context.Context, id, userID int64) (*models.Wishlist, error) {
	var w models.Wishlist
	var desc sql.NullString
	var tgt sql.NullInt64
	err := r.pool.QueryRow(ctx, `
		SELECT w.id, w.user_id, w.name, w.description, w.target_collection_id, w.is_public, w.created_at, w.updated_at,
		       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
		WHERE w.id = $1 AND w.user_id = $2
		GROUP BY w.id, w.user_id, w.name, w.description, w.target_collection_id, w.is_public, w.created_at, w.updated_at
	`, id, userID).Scan(
		&w.ID, &w.UserID, &w.Name, &desc, &tgt, &w.IsPublic, &w.CreatedAt, &w.UpdatedAt, &w.EntryCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get wishlist: %w", err)
	}
	if desc.Valid {
		s := desc.String
		w.Description = &s
	}
	if tgt.Valid {
		v := tgt.Int64
		w.TargetCollectionID = &v
	}
	return &w, nil
}

// GetByIDForViewer returns a wishlist if the viewer owns it or it is public.
func (r *PostgresWishlistRepository) GetByIDForViewer(ctx context.Context, id, viewerID int64) (*models.Wishlist, error) {
	var w models.Wishlist
	var desc sql.NullString
	var tgt sql.NullInt64
	err := r.pool.QueryRow(ctx, `
		SELECT w.id, w.user_id, w.name, w.description, w.target_collection_id, w.is_public, w.created_at, w.updated_at,
		       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
		WHERE w.id = $1 AND (w.user_id = $2 OR w.is_public = true)
		GROUP BY w.id, w.user_id, w.name, w.description, w.target_collection_id, w.is_public, w.created_at, w.updated_at
	`, id, viewerID).Scan(
		&w.ID, &w.UserID, &w.Name, &desc, &tgt, &w.IsPublic, &w.CreatedAt, &w.UpdatedAt, &w.EntryCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get wishlist: %w", err)
	}
	if desc.Valid {
		s := desc.String
		w.Description = &s
	}
	if tgt.Valid {
		v := tgt.Int64
		w.TargetCollectionID = &v
	}
	return &w, nil
}

func (r *PostgresWishlistRepository) Create(ctx context.Context, userID int64, name string, description *string, targetCollectionID *int64, isPublic bool) (*models.Wishlist, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	var descVal interface{}
	if description != nil && strings.TrimSpace(*description) != "" {
		descVal = strings.TrimSpace(*description)
	}
	var tgtArg interface{}
	if targetCollectionID != nil && *targetCollectionID > 0 {
		tgtArg = *targetCollectionID
	}
	var w models.Wishlist
	var desc sql.NullString
	var tgt sql.NullInt64
	err := r.pool.QueryRow(ctx, `
		INSERT INTO wishlists (user_id, name, description, target_collection_id, is_public)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, name, description, target_collection_id, is_public, created_at, updated_at
	`, userID, name, descVal, tgtArg, isPublic).Scan(
		&w.ID, &w.UserID, &w.Name, &desc, &tgt, &w.IsPublic, &w.CreatedAt, &w.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create wishlist: %w", err)
	}
	if desc.Valid {
		s := desc.String
		w.Description = &s
	}
	if tgt.Valid {
		v := tgt.Int64
		w.TargetCollectionID = &v
	}
	w.EntryCount = 0
	return &w, nil
}

// UpdateFull replaces name, description, target collection, and optionally visibility for the wishlist owner.
func (r *PostgresWishlistRepository) UpdateFull(ctx context.Context, id, userID int64, name string, description *string, targetCollectionID *int64, isPublic *bool) (*models.Wishlist, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	var descVal interface{}
	if description != nil {
		if strings.TrimSpace(*description) != "" {
			descVal = strings.TrimSpace(*description)
		}
	}
	var tgtVal interface{}
	if targetCollectionID != nil && *targetCollectionID > 0 {
		tgtVal = *targetCollectionID
	}
	setPublic := isPublic != nil
	var pubVal interface{}
	if setPublic {
		pubVal = *isPublic
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE wishlists
		SET name = $3,
		    description = $4,
		    target_collection_id = $5,
		    is_public = CASE WHEN $6::boolean THEN $7::bool ELSE is_public END,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, id, userID, name, descVal, tgtVal, setPublic, pubVal)
	if err != nil {
		return nil, fmt.Errorf("update wishlist: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrWishlistNotFound
	}
	return r.GetByIDForUser(ctx, id, userID)
}

func (r *PostgresWishlistRepository) Delete(ctx context.Context, id, userID int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM wishlists WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete wishlist: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrWishlistNotFound
	}
	return nil
}

func (r *PostgresWishlistRepository) ListEntries(ctx context.Context, wishlistID, viewerID int64) ([]models.WishlistEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT e.id, e.wishlist_id, e.title, e.category, e.metadata, e.created_at, e.updated_at
		FROM wishlist_entries e
		INNER JOIN wishlists w ON w.id = e.wishlist_id
		WHERE e.wishlist_id = $1 AND (w.user_id = $2 OR w.is_public = true)
		ORDER BY e.created_at DESC
	`, wishlistID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list wishlist entries: %w", err)
	}
	defer rows.Close()

	out := make([]models.WishlistEntry, 0)
	for rows.Next() {
		var e models.WishlistEntry
		if err := rows.Scan(&e.ID, &e.WishlistID, &e.Title, &e.Category, &e.Metadata, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan entry: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *PostgresWishlistRepository) CreateEntry(ctx context.Context, wishlistID, userID int64, title string, category models.Category, metadata json.RawMessage) (*models.WishlistEntry, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("title required")
	}
	if !category.Valid() {
		return nil, fmt.Errorf("invalid category")
	}
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM wishlists WHERE id = $1 AND user_id = $2)
	`, wishlistID, userID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check wishlist: %w", err)
	}
	if !exists {
		return nil, ErrWishlistNotFound
	}

	var e models.WishlistEntry
	err = r.pool.QueryRow(ctx, `
		INSERT INTO wishlist_entries (wishlist_id, title, category, metadata)
		VALUES ($1, $2, $3, $4::jsonb)
		RETURNING id, wishlist_id, title, category, metadata, created_at, updated_at
	`, wishlistID, title, string(category), string(metadata)).Scan(
		&e.ID, &e.WishlistID, &e.Title, &e.Category, &e.Metadata, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create wishlist entry: %w", err)
	}
	return &e, nil
}

func (r *PostgresWishlistRepository) DeleteEntry(ctx context.Context, wishlistID, entryID, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM wishlist_entries e
		USING wishlists w
		WHERE e.id = $1 AND e.wishlist_id = $2 AND e.wishlist_id = w.id AND w.user_id = $3
	`, entryID, wishlistID, userID)
	if err != nil {
		return fmt.Errorf("delete entry: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrWishlistEntryNotFound
	}
	return nil
}

// ObtainEntry creates a real item in the given collection and removes the wishlist entry (transactional).
func (r *PostgresWishlistRepository) ObtainEntry(ctx context.Context, wishlistID, entryID, userID, collectionID int64) (*models.Item, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	var title string
	var cat models.Category
	var meta json.RawMessage
	err = tx.QueryRow(ctx, `
		SELECT e.title, e.category, e.metadata
		FROM wishlist_entries e
		INNER JOIN wishlists w ON w.id = e.wishlist_id
		WHERE e.id = $1 AND e.wishlist_id = $2 AND w.user_id = $3
	`, entryID, wishlistID, userID).Scan(&title, &cat, &meta)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistEntryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load entry: %w", err)
	}

	withR, cerr := itemsTableHasRatingColumn(ctx, r.pool)
	if cerr != nil {
		return nil, fmt.Errorf("insert item: %w", cerr)
	}
	retCols := selectItemColumns(withR)
	var it models.Item
	if withR {
		var rating sql.NullInt32
		err = tx.QueryRow(ctx, `
			INSERT INTO items (collection_id, title, category, metadata, rating)
			VALUES ($1, $2, $3, $4::jsonb, NULL)
			RETURNING `+retCols+`
		`, collectionID, title, string(cat), string(meta)).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &rating, &it.CreatedAt, &it.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("insert item: %w", err)
		}
		it.Rating = ratingPtrFromNull(rating)
	} else {
		err = tx.QueryRow(ctx, `
			INSERT INTO items (collection_id, title, category, metadata)
			VALUES ($1, $2, $3, $4::jsonb)
			RETURNING `+retCols+`
		`, collectionID, title, string(cat), string(meta)).Scan(
			&it.ID, &it.CollectionID, &it.Title, &it.Category, &it.Metadata, &it.CreatedAt, &it.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("insert item: %w", err)
		}
	}

	_, err = tx.Exec(ctx, `DELETE FROM wishlist_entries WHERE id = $1`, entryID)
	if err != nil {
		return nil, fmt.Errorf("delete entry: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return &it, nil
}
