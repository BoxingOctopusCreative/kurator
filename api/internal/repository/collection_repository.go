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
	Q           string // search name / description
	Sort        string // name_asc, name_desc, updated_desc, created_desc, items_desc
	HasDesc     string // "", "yes", "no"
	Limit       int
	Offset      int
}

type PostgresCollectionRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresCollectionRepository(pool *pgxpool.Pool) *PostgresCollectionRepository {
	return &PostgresCollectionRepository{pool: pool}
}

// BeginTx starts a transaction for category-safe item operations.
func (r *PostgresCollectionRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.Begin(ctx)
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

	// Public user-owned shelves are only visible to the owner or users with a follow in either direction;
	// unsigned viewers only see shelves with no owner that remain public (legacy catalog rows).
	if p.ViewerUserID == nil {
		where = append(where, CollectionRowVisibleAnonSQL())
	} else {
		where = append(where, CollectionRowVisibleSQL(fmt.Sprintf("$%d", viewerArg)))
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
		SELECT `+collectionSelectWithAuthor+`,
		       COALESCE(COUNT(i.id), 0)::bigint AS item_count
		FROM collections c
		LEFT JOIN users owner ON owner.id = c.user_id
		LEFT JOIN items i ON i.collection_id = c.id
		WHERE %s
		GROUP BY `+collectionGroupWithAuthor+`
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
func (r *PostgresCollectionRepository) GetByID(ctx context.Context, id string, viewer *int64) (*models.Collection, error) {
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
		where = append(where, CollectionRowVisibleAnonSQL())
	} else {
		where = append(where, CollectionRowVisibleSQL(fmt.Sprintf("$%d", viewerArg)))
	}

	whereSQL := strings.Join(where, " AND ")
	q := fmt.Sprintf(`
		SELECT `+collectionSelectWithAuthor+`,
		       COALESCE(COUNT(i.id), 0)::bigint AS item_count
		FROM collections c
		LEFT JOIN users owner ON owner.id = c.user_id
		LEFT JOIN items i ON i.collection_id = c.id
		WHERE %s
		GROUP BY `+collectionGroupWithAuthor+`
	`, whereSQL)

	c, err := scanCollectionRow(r.pool.QueryRow(ctx, q, args...))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCollectionNotFound
		}
		return nil, fmt.Errorf("get collection: %w", err)
	}
	return &c, nil
}

// IsUserOwnedCollection reports whether the collection exists and is owned by userID.
// Collections with no owner (user_id NULL) return (false, nil).
func (r *PostgresCollectionRepository) IsUserOwnedCollection(ctx context.Context, collectionID string, userID int64) (bool, error) {
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

// UserMayMutateCollectionContent is true when userID may import/export items, create/update/delete items,
// or curate this collection (owner or explicit member when the shelf is shared).
func (r *PostgresCollectionRepository) UserMayMutateCollectionContent(ctx context.Context, collectionID string, userID int64) (bool, error) {
	if userID < 1 {
		return false, nil
	}
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM collections c
			WHERE c.id = $1::uuid AND (
				c.user_id = $2 OR (
					c.is_shared AND EXISTS (
						SELECT 1 FROM shelf_members sm
						WHERE sm.shelf_kind = 'collection' AND sm.shelf_id = c.id AND sm.user_id = $2
					)
				)
			)
		)
	`, collectionID, userID).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("collection mutate permission: %w", err)
	}
	if !ok {
		var exists bool
		_ = r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM collections WHERE id = $1::uuid)`, collectionID).Scan(&exists)
		if !exists {
			return false, ErrCollectionNotFound
		}
	}
	return ok, nil
}

// CollectionFanoutContext holds owner, visibility, and display name for activity notifications.
type CollectionFanoutContext struct {
	OwnerID    int64
	Visibility models.Visibility
	Name       string
}

// GetFanoutContextByCollectionID returns owner + visibility for a user-owned collection.
// ErrCollectionNotFound when missing or user_id is NULL (legacy non-owned shelf).
func (r *PostgresCollectionRepository) GetFanoutContextByCollectionID(ctx context.Context, collectionID string) (*CollectionFanoutContext, error) {
	var owner sql.NullInt64
	var vis string
	var name string
	err := r.pool.QueryRow(ctx, `
		SELECT user_id, visibility::text, name FROM collections WHERE id = $1::uuid
	`, collectionID).Scan(&owner, &vis, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCollectionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("collection fanout context: %w", err)
	}
	if !owner.Valid || owner.Int64 < 1 {
		return nil, ErrCollectionNotFound
	}
	v := models.Visibility(vis)
	if !v.Valid() {
		v = models.DefaultVisibility
	}
	return &CollectionFanoutContext{
		OwnerID:    owner.Int64,
		Visibility: v,
		Name:       name,
	}, nil
}

// collectionSelectColumns/collectionGroupColumns are the core collection row (alias c).
const collectionSelectColumns = "c.id, c.user_id, c.name, c.description, c.category, c.cover_art_url, c.visibility, c.is_shared, c.created_at, c.updated_at"
const collectionAuthorColumns = "owner.username, owner.display_name, owner.avatar_url"
const collectionSelectWithAuthor = collectionSelectColumns + ", " + collectionAuthorColumns
const collectionGroupColumns = "c.id, c.user_id, c.name, c.description, c.category, c.cover_art_url, c.visibility, c.created_at, c.updated_at"
const collectionGroupWithAuthor = collectionGroupColumns + ", owner.username, owner.display_name, owner.avatar_url"

// collectionReturningColumns is the bare columns list for INSERT/UPDATE ... RETURNING.
const collectionReturningColumns = "id, user_id, name, description, category, cover_art_url, visibility, is_shared, created_at, updated_at"
const collectionReturningAuthor = `,
  (SELECT username FROM users u WHERE u.id = collections.user_id),
  (SELECT display_name FROM users u WHERE u.id = collections.user_id),
  (SELECT avatar_url FROM users u WHERE u.id = collections.user_id)`

func scanCollectionRow(row pgx.Row) (models.Collection, error) {
	var c models.Collection
	var uid sql.NullInt64
	var desc sql.NullString
	var cat sql.NullString
	var cover sql.NullString
	var vis string
	var auUser, auDn, auAv sql.NullString
	if err := row.Scan(
		&c.ID, &uid, &c.Name, &desc, &cat, &cover, &vis, &c.IsShared, &c.CreatedAt, &c.UpdatedAt,
		&auUser, &auDn, &auAv,
		&c.ItemCount,
	); err != nil {
		return c, fmt.Errorf("scan collection: %w", err)
	}
	c.Author = nil
	if uid.Valid {
		v := uid.Int64
		c.UserID = &v
		if v >= 1 {
			c.Author = shelfAuthorPtr(auUser, auDn, auAv)
		}
	}
	if desc.Valid {
		s := desc.String
		c.Description = &s
	}
	if cat.Valid && strings.TrimSpace(cat.String) != "" {
		cc := models.Category(strings.TrimSpace(cat.String))
		if cc.Valid() {
			c.Category = &cc
		}
	}
	if cover.Valid && strings.TrimSpace(cover.String) != "" {
		s := strings.TrimSpace(cover.String)
		c.CoverArtURL = &s
	}
	c.Visibility = models.Visibility(vis)
	if !c.Visibility.Valid() {
		c.Visibility = models.DefaultVisibility
	}
	c.IsPublic = c.Visibility.IsPublic()
	return c, nil
}

// Create inserts a collection owned by userID (personal shelf). category may be nil (flex shelf until first item pins it).
func (r *PostgresCollectionRepository) Create(ctx context.Context, userID int64, name string, description *string, visibility models.Visibility, category *models.Category, isShared bool) (*models.Collection, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	if !visibility.Valid() {
		visibility = models.DefaultVisibility
	}
	var descVal interface{}
	if description != nil && strings.TrimSpace(*description) != "" {
		descVal = strings.TrimSpace(*description)
	}
	var catVal interface{}
	if category != nil && category.Valid() {
		catVal = string(*category)
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO collections (user_id, name, description, visibility, is_public, category, is_shared)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+collectionReturningColumns+collectionReturningAuthor+`, 0::bigint AS item_count
	`, userID, name, descVal, string(visibility), visibility.IsPublic(), catVal, isShared)
	c, err := scanCollectionRow(row)
	if err != nil {
		return nil, fmt.Errorf("create collection: %w", err)
	}
	return &c, nil
}

// UpdateByOwner updates name, description, visibility, cover art, and/or is_shared for a collection owned by ownerID.
func (r *PostgresCollectionRepository) UpdateByOwner(ctx context.Context, ownerID int64, id string, name *string, description *string, visibility *models.Visibility, coverArt *string, isShared *bool) (*models.Collection, error) {
	setName := name != nil
	setDesc := description != nil
	setVis := visibility != nil && (*visibility).Valid()
	setCover := coverArt != nil
	setShared := isShared != nil

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
	var visArg interface{}
	if setVis {
		visArg = string(*visibility)
	}
	var coverVal interface{}
	if setCover {
		if strings.TrimSpace(*coverArt) == "" {
			coverVal = nil
		} else {
			coverVal = strings.TrimSpace(*coverArt)
		}
	}
	var sharedVal interface{}
	if setShared {
		sharedVal = *isShared
	}

	row := r.pool.QueryRow(ctx, `
		UPDATE collections SET
			name = CASE WHEN $3::boolean THEN $4::text ELSE name END,
			description = CASE WHEN $5::boolean THEN $6::text ELSE description END,
			visibility = CASE WHEN $7::boolean THEN $8::text ELSE visibility END,
			is_public = CASE WHEN $7::boolean THEN ($8::text <> 'private') ELSE is_public END,
			cover_art_url = CASE WHEN $9::boolean THEN $10::text ELSE cover_art_url END,
			is_shared = CASE WHEN $11::boolean THEN $12::boolean ELSE is_shared END,
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING `+collectionReturningColumns+collectionReturningAuthor+`,
		         (SELECT COUNT(*) FROM items WHERE collection_id = collections.id)::bigint AS item_count
	`, id, ownerID, setName, nameVal, setDesc, descVal, setVis, visArg, setCover, coverVal, setShared, sharedVal)
	c, err := scanCollectionRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCollectionNotFound
		}
		return nil, fmt.Errorf("update collection: %w", err)
	}
	return &c, nil
}

// ResolveDefaultCollectionForItemCreate picks the viewer's oldest owned shelf when the client omits collection_id.
// ListOwnerCollectionsExcept returns the signed-in user's other collections (for move targets when deleting a shelf).
func (r *PostgresCollectionRepository) ListOwnerCollectionsExcept(ctx context.Context, ownerID int64, excludeID string) ([]models.Collection, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+collectionSelectWithAuthor+`, 0::bigint AS item_count
		FROM collections c
		LEFT JOIN users owner ON owner.id = c.user_id
		WHERE c.user_id = $1 AND c.id <> $2::uuid
		ORDER BY c.name ASC
	`, ownerID, excludeID)
	if err != nil {
		return nil, fmt.Errorf("list owner collections: %w", err)
	}
	defer rows.Close()
	out := make([]models.Collection, 0)
	for rows.Next() {
		c, err := scanCollectionRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// DeleteOwnedCollectionTx deletes a row owned by ownerID. Caller must ensure items are gone or moved first.
func (r *PostgresCollectionRepository) DeleteOwnedCollectionTx(ctx context.Context, tx pgx.Tx, ownerID int64, collectionID string) error {
	tag, err := tx.Exec(ctx, `DELETE FROM collections WHERE id = $1 AND user_id = $2`, collectionID, ownerID)
	if err != nil {
		return fmt.Errorf("delete collection: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrCollectionNotFound
	}
	return nil
}

func (r *PostgresCollectionRepository) ResolveDefaultCollectionForItemCreate(ctx context.Context, userID int64) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		SELECT id::text FROM collections WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1
	`, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("no collection available for this account")
	}
	if err != nil {
		return "", fmt.Errorf("resolve default collection: %w", err)
	}
	return id, nil
}
