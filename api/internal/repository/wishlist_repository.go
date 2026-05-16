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

// BeginTx starts a transaction for wishlist delete / entry moves.
func (r *PostgresWishlistRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.Begin(ctx)
}

const wishlistSelectColumns = "w.id, w.user_id, w.name, w.description, w.cover_art_url, w.target_collection_id, w.visibility, w.is_shared, w.created_at, w.updated_at"
const wishlistAuthorColumns = "shelf_owner.username, shelf_owner.display_name, shelf_owner.avatar_url"
const wishlistSelectWithAuthor = wishlistSelectColumns + ", " + wishlistAuthorColumns
const wishlistGroupColumns = "w.id, w.user_id, w.name, w.description, w.cover_art_url, w.target_collection_id, w.visibility, w.is_shared, w.created_at, w.updated_at"
const wishlistGroupWithAuthor = wishlistGroupColumns + ", shelf_owner.username, shelf_owner.display_name, shelf_owner.avatar_url"

const wishlistReturningColumns = "id, user_id, name, description, cover_art_url, target_collection_id, visibility, is_shared, created_at, updated_at"

const wishlistEntrySelectColumns = "e.id, e.wishlist_id, e.title, e.category, e.metadata, e.purchase_url, e.created_at, e.updated_at"
const wishlistEntryReturningColumns = "id, wishlist_id, title, category, metadata, purchase_url, created_at, updated_at"
const wishlistReturningAuthor = `,
  (SELECT username FROM users u WHERE u.id = wishlists.user_id),
  (SELECT display_name FROM users u WHERE u.id = wishlists.user_id),
  (SELECT avatar_url FROM users u WHERE u.id = wishlists.user_id)`

// ListForViewer returns wishlists the viewer may see: their own (any visibility) and others’
// wishlists when the visibility rules permit (followers / friends, see OwnedShelfVisibleToViewerSQL).
func (r *PostgresWishlistRepository) ListForViewer(ctx context.Context, viewerID int64) ([]models.Wishlist, error) {
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("w.user_id", "w.visibility", "w.is_shared", "wishlist", "w.id", "$1")
	rows, err := r.pool.Query(ctx, `
		SELECT `+wishlistSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN users shelf_owner ON shelf_owner.id = w.user_id
		LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
		WHERE `+vis+`
		GROUP BY `+wishlistGroupWithAuthor+`
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

// WishlistsByOwnerForViewer returns wishlists owned by ownerUserID that the viewer may see (same
// visibility rules as ListForViewer). Anonymous viewers only see that owner's public wishlists.
func (r *PostgresWishlistRepository) WishlistsByOwnerForViewer(ctx context.Context, ownerUserID int64, viewer *int64) ([]models.Wishlist, error) {
	if viewer == nil {
		rows, err := r.pool.Query(ctx, `
			SELECT `+wishlistSelectWithAuthor+`,
			       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
			FROM wishlists w
			LEFT JOIN users shelf_owner ON shelf_owner.id = w.user_id
			LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
			WHERE w.user_id = $1 AND w.visibility = 'public'
			GROUP BY `+wishlistGroupWithAuthor+`
			ORDER BY w.updated_at DESC
		`, ownerUserID)
		if err != nil {
			return nil, fmt.Errorf("wishlists by owner for viewer: %w", err)
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
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("w.user_id", "w.visibility", "w.is_shared", "wishlist", "w.id", "$2")
	rows, err := r.pool.Query(ctx, `
		SELECT `+wishlistSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN users shelf_owner ON shelf_owner.id = w.user_id
		LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
		WHERE w.user_id = $1 AND `+vis+`
		GROUP BY `+wishlistGroupWithAuthor+`
		ORDER BY w.updated_at DESC
	`, ownerUserID, *viewer)
	if err != nil {
		return nil, fmt.Errorf("wishlists by owner for viewer: %w", err)
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
	var cover sql.NullString
	var tgt sql.NullString
	var vis string
	var auUser, auDn, auAv sql.NullString
	if err := row.Scan(
		&w.ID, &w.UserID, &w.Name, &desc, &cover, &tgt, &vis, &w.IsShared, &w.CreatedAt, &w.UpdatedAt,
		&auUser, &auDn, &auAv,
		&w.EntryCount,
	); err != nil {
		return w, fmt.Errorf("scan wishlist: %w", err)
	}
	w.Author = shelfAuthorPtr(auUser, auDn, auAv)
	if desc.Valid {
		s := desc.String
		w.Description = &s
	}
	if cover.Valid && strings.TrimSpace(cover.String) != "" {
		s := strings.TrimSpace(cover.String)
		w.CoverArtURL = &s
	}
	if tgt.Valid {
		s := strings.TrimSpace(tgt.String)
		w.TargetCollectionID = &s
	}
	w.Visibility = models.Visibility(vis)
	if !w.Visibility.Valid() {
		w.Visibility = models.DefaultVisibility
	}
	w.IsPublic = w.Visibility.IsPublic()
	return w, nil
}

func scanWishlistEntryRow(row interface {
	Scan(dest ...any) error
}) (models.WishlistEntry, error) {
	var e models.WishlistEntry
	var purchase sql.NullString
	if err := row.Scan(
		&e.ID, &e.WishlistID, &e.Title, &e.Category, &e.Metadata, &purchase, &e.CreatedAt, &e.UpdatedAt,
	); err != nil {
		return e, fmt.Errorf("scan wishlist entry: %w", err)
	}
	if purchase.Valid && strings.TrimSpace(purchase.String) != "" {
		s := strings.TrimSpace(purchase.String)
		e.PurchaseURL = &s
	}
	return e, nil
}

func purchaseURLArg(purchaseURL *string) any {
	if purchaseURL == nil || strings.TrimSpace(*purchaseURL) == "" {
		return nil
	}
	return strings.TrimSpace(*purchaseURL)
}

// GetByIDForUser returns a wishlist only if owned by userID.
func (r *PostgresWishlistRepository) GetByIDForUser(ctx context.Context, id string, userID int64) (*models.Wishlist, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+wishlistSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN users shelf_owner ON shelf_owner.id = w.user_id
		LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
		WHERE w.id = $1 AND w.user_id = $2
		GROUP BY `+wishlistGroupWithAuthor+`
	`, id, userID)
	w, err := scanWishlistRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get wishlist: %w", err)
	}
	return &w, nil
}

// GetByIDForViewer returns a wishlist when visible to the viewer (same rules as ListForViewer).
func (r *PostgresWishlistRepository) GetByIDForViewer(ctx context.Context, id string, viewerID int64) (*models.Wishlist, error) {
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("w.user_id", "w.visibility", "w.is_shared", "wishlist", "w.id", "$2")
	row := r.pool.QueryRow(ctx, `
		SELECT `+wishlistSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN users shelf_owner ON shelf_owner.id = w.user_id
		LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
		WHERE w.id = $1 AND `+vis+`
		GROUP BY `+wishlistGroupWithAuthor+`
	`, id, viewerID)
	w, err := scanWishlistRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get wishlist: %w", err)
	}
	return &w, nil
}

// GetByIDVisible returns a wishlist when visibility allows the viewer (nil = anonymous: public wishlists only).
func (r *PostgresWishlistRepository) GetByIDVisible(ctx context.Context, id string, viewer *int64) (*models.Wishlist, error) {
	if viewer != nil {
		return r.GetByIDForViewer(ctx, id, *viewer)
	}
	row := r.pool.QueryRow(ctx, `
		SELECT `+wishlistSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN users shelf_owner ON shelf_owner.id = w.user_id
		LEFT JOIN wishlist_entries e ON e.wishlist_id = w.id
		WHERE w.id = $1 AND w.visibility = 'public'
		GROUP BY `+wishlistGroupWithAuthor+`
	`, id)
	w, err := scanWishlistRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get wishlist: %w", err)
	}
	return &w, nil
}

// ListEntriesVisible lists wishlist entries when the shelf is visible (nil viewer = public wishlists only).
func (r *PostgresWishlistRepository) ListEntriesVisible(ctx context.Context, wishlistID string, viewer *int64) ([]models.WishlistEntry, error) {
	if viewer != nil {
		return r.ListEntries(ctx, wishlistID, *viewer)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+wishlistEntrySelectColumns+`
		FROM wishlist_entries e
		INNER JOIN wishlists w ON w.id = e.wishlist_id
		WHERE e.wishlist_id = $1 AND w.visibility = 'public'
		ORDER BY e.created_at DESC
	`, wishlistID)
	if err != nil {
		return nil, fmt.Errorf("list wishlist entries: %w", err)
	}
	defer rows.Close()

	out := make([]models.WishlistEntry, 0)
	for rows.Next() {
		e, err := scanWishlistEntryRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *PostgresWishlistRepository) Create(ctx context.Context, userID int64, name string, description *string, targetCollectionID *string, visibility models.Visibility, isShared bool) (*models.Wishlist, error) {
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
	var tgtArg interface{}
	if targetCollectionID != nil && strings.TrimSpace(*targetCollectionID) != "" {
		tgtArg = strings.TrimSpace(*targetCollectionID)
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO wishlists (user_id, name, description, target_collection_id, visibility, is_public, is_shared)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+wishlistReturningColumns+wishlistReturningAuthor+`, 0::bigint AS entry_count
	`, userID, name, descVal, tgtArg, string(visibility), visibility.IsPublic(), isShared)
	w, err := scanWishlistRow(row)
	if err != nil {
		return nil, fmt.Errorf("create wishlist: %w", err)
	}
	return &w, nil
}

// UpdateFull replaces name, description, target collection, and optionally visibility for the wishlist owner.
func (r *PostgresWishlistRepository) UpdateFull(ctx context.Context, id string, userID int64, name string, description *string, targetCollectionID *string, visibility *models.Visibility, coverArt *string, isShared *bool) (*models.Wishlist, error) {
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
	if targetCollectionID != nil && strings.TrimSpace(*targetCollectionID) != "" {
		tgtVal = strings.TrimSpace(*targetCollectionID)
	}
	setVis := visibility != nil && (*visibility).Valid()
	var visArg interface{}
	if setVis {
		visArg = string(*visibility)
	}
	setCover := coverArt != nil
	var coverVal interface{}
	if setCover {
		if strings.TrimSpace(*coverArt) == "" {
			coverVal = nil
		} else {
			coverVal = strings.TrimSpace(*coverArt)
		}
	}
	setShared := isShared != nil
	var sharedVal interface{}
	if setShared {
		sharedVal = *isShared
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE wishlists
		SET name = $3,
		    description = $4,
		    target_collection_id = $5,
		    visibility = CASE WHEN $6::boolean THEN $7::text ELSE visibility END,
		    is_public = CASE WHEN $6::boolean THEN ($7::text <> 'private') ELSE is_public END,
		    cover_art_url = CASE WHEN $8::boolean THEN $9::text ELSE cover_art_url END,
		    is_shared = CASE WHEN $10::boolean THEN $11::boolean ELSE is_shared END,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, id, userID, name, descVal, tgtVal, setVis, visArg, setCover, coverVal, setShared, sharedVal)
	if err != nil {
		return nil, fmt.Errorf("update wishlist: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrWishlistNotFound
	}
	return r.GetByIDForUser(ctx, id, userID)
}

func (r *PostgresWishlistRepository) Delete(ctx context.Context, id string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM wishlists WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete wishlist: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrWishlistNotFound
	}
	return nil
}

// ListEntriesForOwnerExport returns entries for a wishlist owned by userID, ordered by id (stable export).
func (r *PostgresWishlistRepository) ListEntriesForOwnerExport(ctx context.Context, wishlistID string, userID int64) ([]models.WishlistEntry, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+wishlistEntrySelectColumns+`
		FROM wishlist_entries e
		INNER JOIN wishlists w ON w.id = e.wishlist_id
		WHERE e.wishlist_id = $1 AND w.user_id = $2
		ORDER BY e.id ASC
		LIMIT 50000
	`, wishlistID, userID)
	if err != nil {
		return nil, fmt.Errorf("list wishlist entries for export: %w", err)
	}
	defer rows.Close()

	out := make([]models.WishlistEntry, 0)
	for rows.Next() {
		e, err := scanWishlistEntryRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// GetEntryByIDForWishlistOwner loads an entry when it belongs to wishlistID and that wishlist is owned by userID.
func (r *PostgresWishlistRepository) GetEntryByIDForWishlistOwner(ctx context.Context, entryID, wishlistID string, userID int64) (*models.WishlistEntry, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+wishlistEntrySelectColumns+`
		FROM wishlist_entries e
		INNER JOIN wishlists w ON w.id = e.wishlist_id
		WHERE e.id = $1 AND e.wishlist_id = $2 AND w.user_id = $3
	`, entryID, wishlistID, userID)
	e, err := scanWishlistEntryRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrWishlistEntryNotFound
		}
		return nil, fmt.Errorf("get wishlist entry: %w", err)
	}
	return &e, nil
}

// UpdateEntry replaces title, category, metadata, and purchase_url for an entry the user may mutate.
func (r *PostgresWishlistRepository) UpdateEntry(ctx context.Context, wishlistID, entryID string, userID int64, title string, category models.Category, metadata json.RawMessage, purchaseURL *string) (*models.WishlistEntry, error) {
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
	ok, err := r.UserMayMutateWishlistContent(ctx, wishlistID, userID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrWishlistEntryNotFound
	}

	row := r.pool.QueryRow(ctx, `
		UPDATE wishlist_entries e
		SET title = $3, category = $4, metadata = $5::jsonb, purchase_url = $6, updated_at = NOW()
		WHERE e.id = $2::uuid AND e.wishlist_id = $1::uuid
		RETURNING `+wishlistEntryReturningColumns+`
	`, wishlistID, entryID, title, string(category), string(metadata), purchaseURLArg(purchaseURL))
	e, err := scanWishlistEntryRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistEntryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update wishlist entry: %w", err)
	}
	return &e, nil
}

// UpdateEntryPurchaseURL sets or clears purchase_url without changing title, category, or metadata.
func (r *PostgresWishlistRepository) UpdateEntryPurchaseURL(ctx context.Context, wishlistID, entryID string, userID int64, purchaseURL *string) (*models.WishlistEntry, error) {
	ok, err := r.UserMayMutateWishlistContent(ctx, wishlistID, userID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrWishlistEntryNotFound
	}
	row := r.pool.QueryRow(ctx, `
		UPDATE wishlist_entries e
		SET purchase_url = $3, updated_at = NOW()
		WHERE e.id = $2::uuid AND e.wishlist_id = $1::uuid
		RETURNING `+wishlistEntryReturningColumns+`
	`, wishlistID, entryID, purchaseURLArg(purchaseURL))
	e, err := scanWishlistEntryRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistEntryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update wishlist entry purchase url: %w", err)
	}
	return &e, nil
}

func (r *PostgresWishlistRepository) ListEntries(ctx context.Context, wishlistID string, viewerID int64) ([]models.WishlistEntry, error) {
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("w.user_id", "w.visibility", "w.is_shared", "wishlist", "w.id", "$2")
	rows, err := r.pool.Query(ctx, `
		SELECT `+wishlistEntrySelectColumns+`
		FROM wishlist_entries e
		INNER JOIN wishlists w ON w.id = e.wishlist_id
		WHERE e.wishlist_id = $1 AND `+vis+`
		ORDER BY e.created_at DESC
	`, wishlistID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list wishlist entries: %w", err)
	}
	defer rows.Close()

	out := make([]models.WishlistEntry, 0)
	for rows.Next() {
		e, err := scanWishlistEntryRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *PostgresWishlistRepository) UserMayMutateWishlistContent(ctx context.Context, wishlistID string, userID int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM wishlists w
			WHERE w.id = $1::uuid AND (
				w.user_id = $2 OR (
					w.is_shared AND EXISTS (
						SELECT 1 FROM shelf_members sm
						WHERE sm.shelf_kind = 'wishlist' AND sm.shelf_id = w.id AND sm.user_id = $2
					)
				)
			)
		)
	`, wishlistID, userID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("wishlist mutate permission: %w", err)
	}
	return ok, nil
}

func (r *PostgresWishlistRepository) CreateEntry(ctx context.Context, wishlistID string, userID int64, title string, category models.Category, metadata json.RawMessage, purchaseURL *string) (*models.WishlistEntry, error) {
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
	ok, err := r.UserMayMutateWishlistContent(ctx, wishlistID, userID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrWishlistNotFound
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO wishlist_entries (wishlist_id, title, category, metadata, purchase_url)
		VALUES ($1, $2, $3, $4::jsonb, $5)
		RETURNING `+wishlistEntryReturningColumns+`
	`, wishlistID, title, string(category), string(metadata), purchaseURLArg(purchaseURL))
	e, err := scanWishlistEntryRow(row)
	if err != nil {
		return nil, fmt.Errorf("create wishlist entry: %w", err)
	}
	return &e, nil
}

func (r *PostgresWishlistRepository) DeleteEntry(ctx context.Context, wishlistID, entryID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM wishlist_entries e
		USING wishlists w
		WHERE e.id = $1::uuid AND e.wishlist_id = $2::uuid AND e.wishlist_id = w.id AND (
			w.user_id = $3 OR (
				w.is_shared AND EXISTS (
					SELECT 1 FROM shelf_members sm
					WHERE sm.shelf_kind = 'wishlist' AND sm.shelf_id = w.id AND sm.user_id = $3
				)
			)
		)
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
func (r *PostgresWishlistRepository) ObtainEntry(ctx context.Context, wishlistID, entryID string, userID int64, collectionID string) (*models.Item, error) {
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
		WHERE e.id = $1::uuid AND e.wishlist_id = $2::uuid AND (
			w.user_id = $3 OR (
				w.is_shared AND EXISTS (
					SELECT 1 FROM shelf_members sm
					WHERE sm.shelf_kind = 'wishlist' AND sm.shelf_id = w.id AND sm.user_id = $3
				)
			)
		)
	`, entryID, wishlistID, userID).Scan(&title, &cat, &meta)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrWishlistEntryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load entry: %w", err)
	}

	lockedCat, cerr := TxLockCollectionCategory(ctx, tx, collectionID)
	if cerr != nil {
		return nil, cerr
	}
	if err := TxAssertCollectionAcceptsItemCategory(lockedCat, cat); err != nil {
		return nil, err
	}

	withR, cerr := itemsTableHasRatingColumn(ctx, r.pool)
	if cerr != nil {
		return nil, fmt.Errorf("insert item: %w", cerr)
	}
	withC, cerr := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if cerr != nil {
		return nil, fmt.Errorf("insert item: %w", cerr)
	}
	retCols := selectItemColumns(withR, withC)
	var row pgx.Row
	switch {
	case withR && withC:
		row = tx.QueryRow(ctx, `
			INSERT INTO items (collection_id, owner_user_id, title, category, metadata, rating)
			VALUES ($1, NULL, $2, $3, $4::jsonb, NULL)
			RETURNING `+retCols+`
		`, collectionID, title, string(cat), string(meta))
	case withR && !withC:
		row = tx.QueryRow(ctx, `
			INSERT INTO items (collection_id, owner_user_id, title, category, metadata, rating)
			VALUES ($1, NULL, $2, $3, $4::jsonb, NULL)
			RETURNING `+retCols+`
		`, collectionID, title, string(cat), string(meta))
	case !withR && withC:
		row = tx.QueryRow(ctx, `
			INSERT INTO items (collection_id, owner_user_id, title, category, metadata)
			VALUES ($1, NULL, $2, $3, $4::jsonb)
			RETURNING `+retCols+`
		`, collectionID, title, string(cat), string(meta))
	default:
		row = tx.QueryRow(ctx, `
			INSERT INTO items (collection_id, owner_user_id, title, category, metadata)
			VALUES ($1, NULL, $2, $3, $4::jsonb)
			RETURNING `+retCols+`
		`, collectionID, title, string(cat), string(meta))
	}
	it, scanErr := scanItemRow(row.Scan, withR, withC)
	if scanErr != nil {
		return nil, fmt.Errorf("insert item: %w", scanErr)
	}

	if err := TxPromoteCollectionCategoryIfUnset(ctx, tx, collectionID, cat); err != nil {
		return nil, err
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

// CountEntriesByWishlistID counts wishlist_entries for a wishlist.
func (r *PostgresWishlistRepository) CountEntriesByWishlistID(ctx context.Context, wishlistID string) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM wishlist_entries WHERE wishlist_id = $1::uuid`, wishlistID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count wishlist entries: %w", err)
	}
	return n, nil
}

// ListOwnerWishlistsExcept returns wishlists owned by ownerID except excludeID.
func (r *PostgresWishlistRepository) ListOwnerWishlistsExcept(ctx context.Context, ownerID int64, excludeID string) ([]models.Wishlist, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+wishlistSelectWithAuthor+`, 0::bigint AS entry_count
		FROM wishlists w
		LEFT JOIN users shelf_owner ON shelf_owner.id = w.user_id
		WHERE w.user_id = $1 AND w.id <> $2::uuid
		ORDER BY w.name ASC
	`, ownerID, excludeID)
	if err != nil {
		return nil, fmt.Errorf("list owner wishlists: %w", err)
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

// CopyEntriesToWishlistTx copies all entries from fromID into toId (same owner). New entry ids are generated.
func (r *PostgresWishlistRepository) CopyEntriesToWishlistTx(ctx context.Context, tx pgx.Tx, ownerID int64, fromID, toID string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO wishlist_entries (wishlist_id, title, category, metadata, purchase_url)
		SELECT $1::uuid, e.title, e.category, e.metadata, e.purchase_url
		FROM wishlist_entries e
		INNER JOIN wishlists src ON src.id = e.wishlist_id AND src.user_id = $3
		INNER JOIN wishlists dst ON dst.id = $1::uuid AND dst.user_id = $3
		WHERE e.wishlist_id = $2::uuid
	`, toID, fromID, ownerID)
	if err != nil {
		return fmt.Errorf("copy wishlist entries: %w", err)
	}
	return nil
}

// DeleteOwnedWishlistTx deletes a wishlist owned by ownerID (CASCADE removes its entries).
func (r *PostgresWishlistRepository) DeleteOwnedWishlistTx(ctx context.Context, tx pgx.Tx, wishlistID string, ownerID int64) error {
	tag, err := tx.Exec(ctx, `DELETE FROM wishlists WHERE id = $1::uuid AND user_id = $2`, wishlistID, ownerID)
	if err != nil {
		return fmt.Errorf("delete wishlist: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrWishlistNotFound
	}
	return nil
}
