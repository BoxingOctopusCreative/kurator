package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrListNotFound       = errors.New("list not found")
	ErrListDuplicateEntry = errors.New("item is already on this list")
	ErrListEntryNotFound  = errors.New("list entry not found")
)

type PostgresListRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresListRepository(pool *pgxpool.Pool) *PostgresListRepository {
	return &PostgresListRepository{pool: pool}
}

// BeginTx starts a transaction for list delete / entry moves.
func (r *PostgresListRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.Begin(ctx)
}

// listSelectColumns is the canonical column list for list scans (alias l, plus item_count last).
const listSelectColumns = "l.id, l.user_id, l.name, l.description, l.cover_art_url, l.visibility, l.created_at, l.updated_at"
const listGroupColumns = "l.id, l.user_id, l.name, l.description, l.cover_art_url, l.visibility, l.created_at, l.updated_at"

func scanListRow(row interface{ Scan(dest ...any) error }) (models.List, error) {
	var l models.List
	var desc sql.NullString
	var cover sql.NullString
	var vis string
	if err := row.Scan(
		&l.ID, &l.UserID, &l.Name, &desc, &cover, &vis, &l.CreatedAt, &l.UpdatedAt, &l.ItemCount,
	); err != nil {
		return l, fmt.Errorf("scan list: %w", err)
	}
	if desc.Valid {
		s := desc.String
		l.Description = &s
	}
	if cover.Valid && strings.TrimSpace(cover.String) != "" {
		s := strings.TrimSpace(cover.String)
		l.CoverArtURL = &s
	}
	l.Visibility = models.Visibility(vis)
	if !l.Visibility.Valid() {
		l.Visibility = models.DefaultVisibility
	}
	l.IsPublic = l.Visibility.IsPublic()
	return l, nil
}

// ListForViewer returns lists the viewer may see: their own (any visibility) and others’ public
// lists when the visibility rules permit (followers / friends, see OwnedShelfVisibleToViewerSQL).
func (r *PostgresListRepository) ListForViewer(ctx context.Context, viewerID int64) ([]models.List, error) {
	vis := OwnedShelfVisibleToViewerSQL("l.user_id", "l.visibility", "$1")
	rows, err := r.pool.Query(ctx, `
		SELECT `+listSelectColumns+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE `+vis+`
		GROUP BY `+listGroupColumns+`
		ORDER BY l.name ASC
	`, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list lists: %w", err)
	}
	defer rows.Close()
	out := make([]models.List, 0)
	for rows.Next() {
		l, err := scanListRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *PostgresListRepository) GetByIDForUser(ctx context.Context, id string, userID int64) (*models.List, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+listSelectColumns+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE l.id = $1 AND l.user_id = $2
		GROUP BY `+listGroupColumns+`
	`, id, userID)
	l, err := scanListRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrListNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get list: %w", err)
	}
	return &l, nil
}

func (r *PostgresListRepository) GetByIDForViewer(ctx context.Context, id string, viewerID int64) (*models.List, error) {
	vis := OwnedShelfVisibleToViewerSQL("l.user_id", "l.visibility", "$2")
	row := r.pool.QueryRow(ctx, `
		SELECT `+listSelectColumns+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE l.id = $1 AND `+vis+`
		GROUP BY `+listGroupColumns+`
	`, id, viewerID)
	l, err := scanListRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrListNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get list: %w", err)
	}
	return &l, nil
}

func (r *PostgresListRepository) Create(ctx context.Context, userID int64, name string, description *string, visibility models.Visibility) (*models.List, error) {
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
	row := r.pool.QueryRow(ctx, `
		INSERT INTO lists (user_id, name, description, visibility, is_public)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+listSelectColumns+`, 0::bigint AS item_count
	`, userID, name, descVal, string(visibility), visibility.IsPublic())
	l, err := scanListRow(row)
	if err != nil {
		return nil, fmt.Errorf("create list: %w", err)
	}
	return &l, nil
}

func (r *PostgresListRepository) UpdateFull(ctx context.Context, id string, userID int64, name string, description *string, visibility *models.Visibility, coverArt *string) (*models.List, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	var descVal interface{}
	if description != nil && strings.TrimSpace(*description) != "" {
		descVal = strings.TrimSpace(*description)
	} else {
		descVal = nil
	}
	setVis := visibility != nil && (*visibility).Valid()
	var visArg interface{}
	if setVis {
		visArg = string(*visibility)
	}
	setCover := coverArt != nil
	var coverArg interface{}
	if setCover {
		if strings.TrimSpace(*coverArt) == "" {
			coverArg = nil
		} else {
			coverArg = strings.TrimSpace(*coverArt)
		}
	}
	row := r.pool.QueryRow(ctx, `
		UPDATE lists SET
			name = $3,
			description = $4,
			visibility = CASE WHEN $5::boolean THEN $6::text ELSE visibility END,
			is_public = CASE WHEN $5::boolean THEN ($6::text <> 'private') ELSE is_public END,
			cover_art_url = CASE WHEN $7::boolean THEN $8::text ELSE cover_art_url END,
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING `+listSelectColumns+`,
		         (SELECT COUNT(*) FROM list_entries WHERE list_id = lists.id)::bigint AS item_count
	`, id, userID, name, descVal, setVis, visArg, setCover, coverArg)
	l, err := scanListRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrListNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update list: %w", err)
	}
	return &l, nil
}

func (r *PostgresListRepository) Delete(ctx context.Context, id string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM lists WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("delete list: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrListNotFound
	}
	return nil
}

// ListItemsForViewer returns items on the list in reverse chronological add order.
func (r *PostgresListRepository) ListItemsForViewer(ctx context.Context, listID string, viewerID int64) ([]models.Item, error) {
	withR, err := itemsTableHasRatingColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list list items: %w", err)
	}
	withC, err := itemsTableHasConsumptionStatusColumn(ctx, r.pool)
	if err != nil {
		return nil, fmt.Errorf("list list items: %w", err)
	}
	cols := selectItemColumnsAliased("i", withR, withC)
	vis := OwnedShelfVisibleToViewerSQL("l.user_id", "l.visibility", "$2")
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM list_entries le
		INNER JOIN lists l ON l.id = le.list_id
		INNER JOIN items i ON i.id = le.item_id
		WHERE le.list_id = $1 AND `+vis+`
		ORDER BY le.created_at DESC
	`, cols), listID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("list list items: %w", err)
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

// AddItem adds an existing item to a list owned by userID. The caller must verify the item is in a collection this user may curate.
func (r *PostgresListRepository) AddItem(ctx context.Context, listID, itemID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO list_entries (list_id, item_id)
		SELECT $1, $2
		FROM lists l
		WHERE l.id = $1 AND l.user_id = $3
	`, listID, itemID, userID)
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			return ErrListDuplicateEntry
		}
		return fmt.Errorf("add list item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrListNotFound
	}
	return nil
}

func (r *PostgresListRepository) RemoveItem(ctx context.Context, listID, itemID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM list_entries e
		USING lists l
		WHERE e.list_id = $1 AND e.item_id = $2 AND e.list_id = l.id AND l.user_id = $3
	`, listID, itemID, userID)
	if err != nil {
		return fmt.Errorf("remove list item: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrListEntryNotFound
	}
	return nil
}

// CountEntriesByListID counts list_entries rows for a list.
func (r *PostgresListRepository) CountEntriesByListID(ctx context.Context, listID string) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM list_entries WHERE list_id = $1::uuid`, listID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count list entries: %w", err)
	}
	return n, nil
}

// ListOwnerListsExcept returns lists owned by ownerID except excludeID (for move targets).
func (r *PostgresListRepository) ListOwnerListsExcept(ctx context.Context, ownerID int64, excludeID string) ([]models.List, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+listSelectColumns+`, 0::bigint AS item_count
		FROM lists l
		WHERE l.user_id = $1 AND l.id <> $2::uuid
		ORDER BY l.name ASC
	`, ownerID, excludeID)
	if err != nil {
		return nil, fmt.Errorf("list owner lists: %w", err)
	}
	defer rows.Close()
	out := make([]models.List, 0)
	for rows.Next() {
		l, err := scanListRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// MoveEntriesToListTx copies item links from fromListID to toListID (same owner). Duplicate (list_id, item_id) on target are skipped.
func (r *PostgresListRepository) MoveEntriesToListTx(ctx context.Context, tx pgx.Tx, ownerID int64, fromListID, toListID string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO list_entries (list_id, item_id)
		SELECT $1::uuid, le.item_id
		FROM list_entries le
		INNER JOIN lists src ON src.id = le.list_id AND src.user_id = $3
		INNER JOIN lists dst ON dst.id = $1::uuid AND dst.user_id = $3
		WHERE le.list_id = $2::uuid
		ON CONFLICT (list_id, item_id) DO NOTHING
	`, toListID, fromListID, ownerID)
	if err != nil {
		return fmt.Errorf("move list entries: %w", err)
	}
	return nil
}

// ListRefsContainingItemForViewer returns lists that include this item and are visible to the viewer
// (their own lists or others’ public lists). When viewerID is nil, only public lists are returned.
func (r *PostgresListRepository) ListRefsContainingItemForViewer(ctx context.Context, itemID string, viewerID *int64) ([]models.ListRef, error) {
	var rows pgx.Rows
	var err error
	if viewerID != nil {
		vis := OwnedShelfVisibleToViewerSQL("l.user_id", "l.visibility", "$2")
		rows, err = r.pool.Query(ctx, `
			SELECT l.id::text, l.name, l.cover_art_url
			FROM list_entries le
			INNER JOIN lists l ON l.id = le.list_id
			WHERE le.item_id = $1::uuid AND `+vis+`
			ORDER BY l.name ASC
		`, itemID, *viewerID)
	} else {
		// Lists are always user-owned; unsigned viewers never see another user’s list by name here.
		rows, err = r.pool.Query(ctx, `
			SELECT l.id::text, l.name, l.cover_art_url
			FROM list_entries le
			INNER JOIN lists l ON l.id = le.list_id
			WHERE le.item_id = $1::uuid AND false
			ORDER BY l.name ASC
		`, itemID)
	}
	if err != nil {
		return nil, fmt.Errorf("list refs for item: %w", err)
	}
	defer rows.Close()
	out := make([]models.ListRef, 0)
	for rows.Next() {
		var ref models.ListRef
		var cover sql.NullString
		if err := rows.Scan(&ref.ID, &ref.Name, &cover); err != nil {
			return nil, err
		}
		if cover.Valid && strings.TrimSpace(cover.String) != "" {
			s := strings.TrimSpace(cover.String)
			ref.CoverArtURL = &s
		}
		out = append(out, ref)
	}
	return out, rows.Err()
}

// DeleteOwnedListTx deletes a list row owned by ownerID (CASCADE removes remaining list_entries on that list).
func (r *PostgresListRepository) DeleteOwnedListTx(ctx context.Context, tx pgx.Tx, listID string, ownerID int64) error {
	tag, err := tx.Exec(ctx, `DELETE FROM lists WHERE id = $1::uuid AND user_id = $2`, listID, ownerID)
	if err != nil {
		return fmt.Errorf("delete list: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrListNotFound
	}
	return nil
}
