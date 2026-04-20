package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrCollectionNotFound is returned when a collection id does not exist or is not visible.
var ErrCollectionNotFound = errors.New("collection not found")

type CollectionListParams struct {
	ViewerUserID *int64 // nil = not signed in
	// FollowingOnly restricts to public collections owned by users the viewer follows (requires ViewerUserID).
	FollowingOnly bool
	// OwnerUserID when set lists only that user's collections (subject to visibility rules).
	OwnerUserID *int64
	Q            string // search name / description
	Sort         string // name_asc, name_desc, updated_desc, created_desc, items_desc
	HasDesc      string // "", "yes", "no"
	Limit        int
	Offset       int
}

type PostgresCollectionRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresCollectionRepository(pool *pgxpool.Pool) *PostgresCollectionRepository {
	return &PostgresCollectionRepository{pool: pool}
}

// List builds dynamic WHERE clauses using only fixed SQL fragments and pgx placeholders ($n).
// User-supplied search text is never concatenated into SQL as raw string (ILIKE uses bound parameters).
// ORDER BY is chosen only from a fixed allowlist (see validation.CollectionSort in the service layer).
func (r *PostgresCollectionRepository) List(ctx context.Context, p CollectionListParams) ([]models.Collection, int64, error) {
	if p.Limit <= 0 || p.Limit > 48 {
		p.Limit = 12
	}
	if p.Offset < 0 {
		p.Offset = 0
	}

	var args []interface{}
	n := 1
	addArg := func(v interface{}) int {
		args = append(args, v)
		cur := n
		n++
		return cur
	}

	var where []string

	var viewerArg int
	if p.ViewerUserID != nil {
		viewerArg = addArg(*p.ViewerUserID)
	}

	// Legacy shared collections (user_id NULL) are always visible.
	// User-owned: visible if public, or viewer is the owner.
	if p.ViewerUserID == nil {
		where = append(where, "(c.user_id IS NULL OR c.is_public)")
	} else {
		where = append(where, fmt.Sprintf("(c.user_id IS NULL OR c.is_public OR c.user_id = $%d)", viewerArg))
	}

	if p.FollowingOnly {
		if p.ViewerUserID == nil {
			return nil, 0, fmt.Errorf("following feed requires signed-in user")
		}
		where = append(where, fmt.Sprintf(
			"c.user_id IS NOT NULL AND c.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = $%d) AND c.user_id <> $%d",
			viewerArg, viewerArg,
		))
	}

	if p.OwnerUserID != nil {
		oa := addArg(*p.OwnerUserID)
		where = append(where, fmt.Sprintf("c.user_id = $%d", oa))
	}

	q := strings.TrimSpace(p.Q)
	if q != "" {
		pat := "%" + q + "%"
		i1 := addArg(pat)
		i2 := addArg(pat)
		where = append(where, fmt.Sprintf("(c.name ILIKE $%d OR COALESCE(c.description, '') ILIKE $%d)", i1, i2))
	}

	switch p.HasDesc {
	case "yes":
		where = append(where, "(c.description IS NOT NULL AND BTRIM(c.description) <> '')")
	case "no":
		where = append(where, "(c.description IS NULL OR BTRIM(COALESCE(c.description, '')) = '')")
	}

	whereSQL := strings.Join(where, " AND ")

	order := "c.name ASC"
	switch p.Sort {
	case "name_desc":
		order = "c.name DESC"
	case "updated_desc":
		order = "c.updated_at DESC"
	case "created_desc":
		order = "c.created_at DESC"
	case "items_desc":
		order = "COUNT(i.id) DESC NULLS LAST, c.name ASC"
	}

	countSQL := fmt.Sprintf(`SELECT COUNT(*) FROM collections c WHERE %s`, whereSQL)
	var total int64
	if err := r.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count collections: %w", err)
	}

	limitArg := addArg(p.Limit)
	offsetArg := addArg(p.Offset)

	listSQL := fmt.Sprintf(`
		SELECT c.id, c.user_id, c.name, c.description, c.is_public, c.created_at, c.updated_at,
		       COALESCE(COUNT(i.id), 0)::bigint AS item_count
		FROM collections c
		LEFT JOIN items i ON i.collection_id = c.id
		WHERE %s
		GROUP BY c.id, c.user_id, c.name, c.description, c.is_public, c.created_at, c.updated_at
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, whereSQL, order, limitArg, offsetArg)

	rows, err := r.pool.Query(ctx, listSQL, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list collections: %w", err)
	}
	defer rows.Close()

	out := make([]models.Collection, 0)
	for rows.Next() {
		c, err := scanCollectionRow(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, c)
	}
	return out, total, rows.Err()
}

// GetByID returns one collection if visible to the viewer (same rules as List).
func (r *PostgresCollectionRepository) GetByID(ctx context.Context, id int64, viewer *int64) (*models.Collection, error) {
	var args []interface{}
	n := 1
	addArg := func(v interface{}) int {
		args = append(args, v)
		cur := n
		n++
		return cur
	}

	idArg := addArg(id)
	var where []string
	where = append(where, fmt.Sprintf("c.id = $%d", idArg))

	var viewerArg int
	if viewer != nil {
		viewerArg = addArg(*viewer)
	}

	if viewer == nil {
		where = append(where, "(c.user_id IS NULL OR c.is_public)")
	} else {
		where = append(where, fmt.Sprintf("(c.user_id IS NULL OR c.is_public OR c.user_id = $%d)", viewerArg))
	}

	whereSQL := strings.Join(where, " AND ")
	q := fmt.Sprintf(`
		SELECT c.id, c.user_id, c.name, c.description, c.is_public, c.created_at, c.updated_at,
		       COALESCE(COUNT(i.id), 0)::bigint AS item_count
		FROM collections c
		LEFT JOIN items i ON i.collection_id = c.id
		WHERE %s
		GROUP BY c.id, c.user_id, c.name, c.description, c.is_public, c.created_at, c.updated_at
	`, whereSQL)

	var c models.Collection
	var uid sql.NullInt64
	var desc sql.NullString
	err := r.pool.QueryRow(ctx, q, args...).Scan(
		&c.ID, &uid, &c.Name, &desc, &c.IsPublic, &c.CreatedAt, &c.UpdatedAt, &c.ItemCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCollectionNotFound
		}
		return nil, fmt.Errorf("get collection: %w", err)
	}
	if uid.Valid {
		v := uid.Int64
		c.UserID = &v
	}
	if desc.Valid {
		s := desc.String
		c.Description = &s
	}
	return &c, nil
}

// LegacyDefaultCollectionID is the id from migration 001_init ("Default" shelf). It may still have user_id NULL.
const LegacyDefaultCollectionID int64 = 1

// IsUserOwnedCollection reports whether the collection exists and is owned by userID.
// Legacy shared collections (user_id NULL) return (false, nil).
func (r *PostgresCollectionRepository) IsUserOwnedCollection(ctx context.Context, collectionID, userID int64) (bool, error) {
	var uid sql.NullInt64
	err := r.pool.QueryRow(ctx, `SELECT user_id FROM collections WHERE id = $1`, collectionID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrCollectionNotFound
	}
	if err != nil {
		return false, fmt.Errorf("collection owner check: %w", err)
	}
	if !uid.Valid {
		return false, nil
	}
	return uid.Int64 == userID, nil
}

// UserMayMutateCollectionContent is true when userID may import/export items, PATCH the collection,
// or create/update/delete items targeting this collection. Personal shelves use normal ownership.
// The seed Default shelf (id=1) may still have user_id NULL; any signed-in user is allowed so
// single-tenant and legacy databases keep working. UpdateByOwner assigns user_id on first PATCH.
func (r *PostgresCollectionRepository) UserMayMutateCollectionContent(ctx context.Context, collectionID, userID int64) (bool, error) {
	if userID < 1 {
		return false, nil
	}
	owned, err := r.IsUserOwnedCollection(ctx, collectionID, userID)
	if err != nil {
		return false, err
	}
	if owned {
		return true, nil
	}
	var uid sql.NullInt64
	err = r.pool.QueryRow(ctx, `SELECT user_id FROM collections WHERE id = $1`, collectionID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrCollectionNotFound
	}
	if err != nil {
		return false, fmt.Errorf("collection mutate check: %w", err)
	}
	if !uid.Valid && collectionID == LegacyDefaultCollectionID {
		return true, nil
	}
	return false, nil
}

func scanCollectionRow(row pgx.Row) (models.Collection, error) {
	var c models.Collection
	var uid sql.NullInt64
	var desc sql.NullString
	if err := row.Scan(
		&c.ID, &uid, &c.Name, &desc, &c.IsPublic, &c.CreatedAt, &c.UpdatedAt, &c.ItemCount,
	); err != nil {
		return c, fmt.Errorf("scan collection: %w", err)
	}
	if uid.Valid {
		v := uid.Int64
		c.UserID = &v
	}
	if desc.Valid {
		s := desc.String
		c.Description = &s
	}
	return c, nil
}

// Create inserts a collection owned by userID (personal shelf).
func (r *PostgresCollectionRepository) Create(ctx context.Context, userID int64, name string, description *string, isPublic bool) (*models.Collection, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	var descVal interface{}
	if description != nil && strings.TrimSpace(*description) != "" {
		descVal = strings.TrimSpace(*description)
	}
	var c models.Collection
	var uid sql.NullInt64
	var desc sql.NullString
	err := r.pool.QueryRow(ctx, `
		INSERT INTO collections (user_id, name, description, is_public)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, name, description, is_public, created_at, updated_at
	`, userID, name, descVal, isPublic).Scan(
		&c.ID, &uid, &c.Name, &desc, &c.IsPublic, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create collection: %w", err)
	}
	if uid.Valid {
		v := uid.Int64
		c.UserID = &v
	}
	if desc.Valid {
		s := desc.String
		c.Description = &s
	}
	c.ItemCount = 0
	return &c, nil
}

// UpdateByOwner updates name, description, and/or visibility for a collection owned by ownerID.
func (r *PostgresCollectionRepository) UpdateByOwner(ctx context.Context, ownerID, id int64, name *string, description *string, isPublic *bool) (*models.Collection, error) {
	setName := name != nil
	setDesc := description != nil
	setPublic := isPublic != nil

	var nameVal interface{}
	if setName {
		nameVal = strings.TrimSpace(*name)
	}
	var descVal interface{}
	if setDesc {
		s := strings.TrimSpace(*description)
		if s == "" {
			descVal = nil
		} else {
			descVal = s
		}
	}
	var pubVal interface{}
	if setPublic {
		pubVal = *isPublic
	}

	var c models.Collection
	var uid sql.NullInt64
	var desc sql.NullString
	err := r.pool.QueryRow(ctx, `
		UPDATE collections SET
			user_id = COALESCE(user_id, $2::bigint),
			name = CASE WHEN $3::boolean THEN $4::text ELSE name END,
			description = CASE WHEN $5::boolean THEN $6::text ELSE description END,
			is_public = CASE WHEN $7::boolean THEN $8::bool ELSE is_public END,
			updated_at = NOW()
		WHERE id = $1 AND (user_id = $2 OR (id = $9 AND user_id IS NULL))
		RETURNING id, user_id, name, description, is_public, created_at, updated_at
	`, id, ownerID, setName, nameVal, setDesc, descVal, setPublic, pubVal, LegacyDefaultCollectionID).Scan(
		&c.ID, &uid, &c.Name, &desc, &c.IsPublic, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCollectionNotFound
		}
		return nil, fmt.Errorf("update collection: %w", err)
	}
	if uid.Valid {
		v := uid.Int64
		c.UserID = &v
	}
	if desc.Valid {
		s := desc.String
		c.Description = &s
	}
	var cnt int64
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM items WHERE collection_id = $1`, id).Scan(&cnt); err != nil {
		return nil, fmt.Errorf("count items: %w", err)
	}
	c.ItemCount = cnt
	return &c, nil
}
