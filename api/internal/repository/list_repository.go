package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrListNotFound       = errors.New("list not found")
	ErrListDuplicateEntry = errors.New("item is already on this list")
	ErrListEntryNotFound  = errors.New("list entry not found")
	ErrListSlugTaken      = errors.New("slug is already in use")
	// ErrListReorderInvalid means the payload is not a permutation of this list's entries.
	ErrListReorderInvalid = errors.New("invalid entry order")
)

// ListUpdateExtras carries optional slug / comments_enabled changes for UpdateFull.
type ListUpdateExtras struct {
	SetSlug            bool
	Slug               *string // when SetSlug: nil or empty trims to NULL slug
	SetComments        bool
	CommentsEnabled    *bool
	SetEntriesNumbered bool
	EntriesNumbered    *bool
}

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

const listSelectColumns = "l.id, l.user_id, l.name, l.description, l.cover_art_url, l.slug, l.comments_enabled, l.entries_numbered, l.visibility, l.is_shared, l.created_at, l.updated_at, COALESCE(l.view_count, 0)"
const listAuthorColumns = "shelf_owner.username, shelf_owner.display_name, shelf_owner.avatar_url"
const listSelectWithAuthor = listSelectColumns + ", " + listAuthorColumns
const listGroupColumns = "l.id, l.user_id, l.name, l.description, l.cover_art_url, l.slug, l.comments_enabled, l.entries_numbered, l.visibility, l.is_shared, l.created_at, l.updated_at, l.view_count"
const listGroupWithAuthor = listGroupColumns + ", shelf_owner.username, shelf_owner.display_name, shelf_owner.avatar_url"

// Bare column names for INSERT/UPDATE RETURNING (no table alias).
const listReturningColumns = "id, user_id, name, description, cover_art_url, slug, comments_enabled, entries_numbered, visibility, is_shared, created_at, updated_at, view_count"
const listReturningAuthor = `,
  (SELECT username FROM users u WHERE u.id = lists.user_id),
  (SELECT display_name FROM users u WHERE u.id = lists.user_id),
  (SELECT avatar_url FROM users u WHERE u.id = lists.user_id)`

func scanListRow(row interface{ Scan(dest ...any) error }) (models.List, error) {
	return scanListRowWithOptionalSocial(row, false)
}

// scanListRowWithOptionalSocial when withSocialStats is true expects two extra bigint columns (vote_count, comment_count)
// and one boolean (viewer_has_voted) for the discover feed.
func scanListRowWithOptionalSocial(row interface{ Scan(dest ...any) error }, withSocialStats bool) (models.List, error) {
	var l models.List
	var desc sql.NullString
	var cover sql.NullString
	var slug sql.NullString
	var vis string
	var auUser, auDn, auAv sql.NullString
	dest := []any{
		&l.ID, &l.UserID, &l.Name, &desc, &cover, &slug, &l.CommentsEnabled, &l.EntriesNumbered, &vis, &l.IsShared, &l.CreatedAt, &l.UpdatedAt,
		&l.ViewCount,
		&auUser, &auDn, &auAv,
		&l.ItemCount,
	}
	if withSocialStats {
		dest = append(dest, &l.VoteCount, &l.CommentCount, &l.ViewerHasVoted)
	}
	if err := row.Scan(dest...); err != nil {
		return l, fmt.Errorf("scan list: %w", err)
	}
	l.Author = shelfAuthorPtr(auUser, auDn, auAv)
	if desc.Valid {
		s := desc.String
		l.Description = &s
	}
	if cover.Valid && strings.TrimSpace(cover.String) != "" {
		s := strings.TrimSpace(cover.String)
		l.CoverArtURL = &s
	}
	if slug.Valid && strings.TrimSpace(slug.String) != "" {
		s := strings.TrimSpace(slug.String)
		l.Slug = &s
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
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$1")
	rows, err := r.pool.Query(ctx, `
		SELECT `+listSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE `+vis+`
		GROUP BY `+listGroupWithAuthor+`
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

// ListByOwnerForViewer returns lists owned by ownerUserID that the viewer may see (same visibility
// rules as ListForViewer). Anonymous viewers only see that owner's public lists.
func (r *PostgresListRepository) ListByOwnerForViewer(ctx context.Context, ownerUserID int64, viewer *int64) ([]models.List, error) {
	if viewer == nil {
		rows, err := r.pool.Query(ctx, `
			SELECT `+listSelectWithAuthor+`,
			       COALESCE(COUNT(e.id), 0)::bigint AS item_count
			FROM lists l
			LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
			LEFT JOIN list_entries e ON e.list_id = l.id
			WHERE l.user_id = $1 AND l.visibility = 'public'
			GROUP BY `+listGroupWithAuthor+`
			ORDER BY l.updated_at DESC
		`, ownerUserID)
		if err != nil {
			return nil, fmt.Errorf("list by owner for viewer: %w", err)
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
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$2")
	rows, err := r.pool.Query(ctx, `
		SELECT `+listSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE l.user_id = $1 AND `+vis+`
		GROUP BY `+listGroupWithAuthor+`
		ORDER BY l.updated_at DESC
	`, ownerUserID, *viewer)
	if err != nil {
		return nil, fmt.Errorf("list by owner for viewer: %w", err)
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

// ErrInvalidHitlistDiscoverSort is returned when the sort query parameter is not recognized.
var ErrInvalidHitlistDiscoverSort = errors.New("invalid hitlist discover sort")

func discoverHitlistOrderBy(sort string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(sort)) {
	case "liked":
		return "vote_count DESC, l.updated_at DESC", nil
	case "active":
		return "(COALESCE(l.view_count, 0) + comment_count) DESC, l.updated_at DESC", nil
	case "hottest":
		return "((vote_count * 4) + COALESCE(l.view_count, 0) + (comment_count * 3)) DESC, l.updated_at DESC", nil
	case "recent", "":
		return "l.updated_at DESC", nil
	default:
		return "", ErrInvalidHitlistDiscoverSort
	}
}

// ListDiscoverForViewer returns non-private hitlists the viewer may see (nil viewer → public only),
// with vote / comment counts for feed sorting.
func (r *PostgresListRepository) ListDiscoverForViewer(ctx context.Context, viewer *int64, sort string) ([]models.List, error) {
	orderBy, err := discoverHitlistOrderBy(sort)
	if err != nil {
		return nil, err
	}
	var visClause string
	args := []any{}
	if viewer == nil {
		visClause = "l.visibility = 'public'"
	} else {
		visClause = OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$1")
		args = append(args, *viewer)
	}
	var joinViewerVote string
	var viewerVoteSelect string
	if viewer == nil {
		joinViewerVote = ""
		viewerVoteSelect = "FALSE AS viewer_has_voted"
	} else {
		joinViewerVote = "LEFT JOIN hitlist_votes hv_me ON hv_me.list_id = l.id AND hv_me.user_id = $1::bigint"
		viewerVoteSelect = "BOOL_OR(hv_me.user_id IS NOT NULL) AS viewer_has_voted"
	}
	q := `
		SELECT ` + listSelectWithAuthor + `,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count,
		       (SELECT COUNT(*)::bigint FROM hitlist_votes hv WHERE hv.list_id = l.id) AS vote_count,
		       (SELECT COUNT(*)::bigint FROM hitlist_comments hc WHERE hc.list_id = l.id) AS comment_count,
		       ` + viewerVoteSelect + `
		FROM lists l
		LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
		` + joinViewerVote + `
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE l.visibility <> 'private' AND (` + visClause + `)
		GROUP BY ` + listGroupWithAuthor + `
		ORDER BY ` + orderBy
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list discover: %w", err)
	}
	defer rows.Close()
	out := make([]models.List, 0)
	for rows.Next() {
		l, err := scanListRowWithOptionalSocial(rows, true)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// IncrementListViewCount adds one to the list's view counter (best-effort; ignores missing rows).
func (r *PostgresListRepository) IncrementListViewCount(ctx context.Context, listID string) error {
	_, err := r.pool.Exec(ctx, `UPDATE lists SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1::uuid`, listID)
	if err != nil {
		return fmt.Errorf("increment list view_count: %w", err)
	}
	return nil
}

func (r *PostgresListRepository) GetByIDForUser(ctx context.Context, id string, userID int64) (*models.List, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+listSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE l.id = $1 AND l.user_id = $2
		GROUP BY `+listGroupWithAuthor+`
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
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$2")
	row := r.pool.QueryRow(ctx, `
		SELECT `+listSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE l.id = $1 AND `+vis+`
		GROUP BY `+listGroupWithAuthor+`
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

// GetByIDVisible returns a list when visibility allows the viewer (nil = anonymous: public lists only).
func (r *PostgresListRepository) GetByIDVisible(ctx context.Context, id string, viewer *int64) (*models.List, error) {
	if viewer != nil {
		return r.GetByIDForViewer(ctx, id, *viewer)
	}
	row := r.pool.QueryRow(ctx, `
		SELECT `+listSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE l.id = $1 AND l.visibility = 'public'
		GROUP BY `+listGroupWithAuthor+`
	`, id)
	l, err := scanListRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrListNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get list: %w", err)
	}
	return &l, nil
}

// GetBySlugVisible resolves a hitlist by permalink slug.
func (r *PostgresListRepository) GetBySlugVisible(ctx context.Context, slug string, viewer *int64) (*models.List, error) {
	slug = strings.TrimSpace(strings.ToLower(slug))
	if slug == "" {
		return nil, ErrListNotFound
	}
	if viewer != nil {
		vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$2")
		row := r.pool.QueryRow(ctx, `
			SELECT `+listSelectWithAuthor+`,
			       COALESCE(COUNT(e.id), 0)::bigint AS item_count
			FROM lists l
			LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
			LEFT JOIN list_entries e ON e.list_id = l.id
			WHERE l.slug = $1 AND `+vis+`
			GROUP BY `+listGroupWithAuthor+`
		`, slug, *viewer)
		l, err := scanListRow(row)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrListNotFound
		}
		if err != nil {
			return nil, fmt.Errorf("get list: %w", err)
		}
		return &l, nil
	}
	row := r.pool.QueryRow(ctx, `
		SELECT `+listSelectWithAuthor+`,
		       COALESCE(COUNT(e.id), 0)::bigint AS item_count
		FROM lists l
		LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
		LEFT JOIN list_entries e ON e.list_id = l.id
		WHERE l.slug = $1 AND l.visibility = 'public'
		GROUP BY `+listGroupWithAuthor+`
	`, slug)
	l, err := scanListRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrListNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get list: %w", err)
	}
	return &l, nil
}

// SlugInUse returns whether slug is taken by a list other than excludeID (pass empty to test any owner).
func (r *PostgresListRepository) SlugInUse(ctx context.Context, slug string, excludeListID string) (bool, error) {
	slug = strings.TrimSpace(strings.ToLower(slug))
	if slug == "" {
		return false, nil
	}
	var exists bool
	q := `SELECT EXISTS (SELECT 1 FROM lists WHERE slug = $1`
	args := []any{slug}
	if strings.TrimSpace(excludeListID) != "" {
		q += ` AND id <> $2::uuid`
		args = append(args, excludeListID)
	}
	q += `)`
	if err := r.pool.QueryRow(ctx, q, args...).Scan(&exists); err != nil {
		return false, fmt.Errorf("slug check: %w", err)
	}
	return exists, nil
}

func (r *PostgresListRepository) UserMayMutateListContent(ctx context.Context, listID string, userID int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM lists l
			WHERE l.id = $1::uuid AND (
				l.user_id = $2 OR (
					l.is_shared AND EXISTS (
						SELECT 1 FROM shelf_members sm
						WHERE sm.shelf_kind = 'list' AND sm.shelf_id = l.id AND sm.user_id = $2
					)
				)
			)
		)
	`, listID, userID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("list mutate permission: %w", err)
	}
	return ok, nil
}

func (r *PostgresListRepository) Create(ctx context.Context, userID int64, name string, description *string, visibility models.Visibility, isShared bool, slug *string, commentsEnabled *bool, entriesNumbered *bool) (*models.List, error) {
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
	var slugVal interface{}
	if slug != nil && strings.TrimSpace(*slug) != "" {
		slugVal = strings.TrimSpace(*slug)
	}
	ce := true
	if commentsEnabled != nil {
		ce = *commentsEnabled
	}
	en := true
	if entriesNumbered != nil {
		en = *entriesNumbered
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO lists (user_id, name, description, visibility, is_public, is_shared, slug, comments_enabled, entries_numbered)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING `+listReturningColumns+listReturningAuthor+`, 0::bigint AS item_count
	`, userID, name, descVal, string(visibility), visibility.IsPublic(), isShared, slugVal, ce, en)
	l, err := scanListRow(row)
	if err != nil {
		return nil, fmt.Errorf("create list: %w", err)
	}
	return &l, nil
}

func (r *PostgresListRepository) UpdateFull(ctx context.Context, id string, userID int64, name string, description *string, visibility *models.Visibility, coverArt *string, isShared *bool, extra *ListUpdateExtras) (*models.List, error) {
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
	setShared := isShared != nil
	var sharedArg interface{}
	if setShared {
		sharedArg = *isShared
	}
	setSlug := false
	var slugArg interface{}
	if extra != nil && extra.SetSlug {
		setSlug = true
		if extra.Slug != nil && strings.TrimSpace(*extra.Slug) != "" {
			slugArg = strings.TrimSpace(*extra.Slug)
		} else {
			slugArg = nil
		}
	}
	setComments := false
	var commentsArg interface{}
	if extra != nil && extra.SetComments && extra.CommentsEnabled != nil {
		setComments = true
		commentsArg = *extra.CommentsEnabled
	}
	setEntriesNumbered := false
	var entriesNumberedArg interface{}
	if extra != nil && extra.SetEntriesNumbered && extra.EntriesNumbered != nil {
		setEntriesNumbered = true
		entriesNumberedArg = *extra.EntriesNumbered
	}
	row := r.pool.QueryRow(ctx, `
		UPDATE lists SET
			name = $3,
			description = $4,
			visibility = CASE WHEN $5::boolean THEN $6::text ELSE visibility END,
			is_public = CASE WHEN $5::boolean THEN ($6::text <> 'private') ELSE is_public END,
			cover_art_url = CASE WHEN $7::boolean THEN $8::text ELSE cover_art_url END,
			is_shared = CASE WHEN $9::boolean THEN $10::boolean ELSE is_shared END,
			slug = CASE WHEN $11::boolean THEN $12::text ELSE slug END,
			comments_enabled = CASE WHEN $13::boolean THEN $14::boolean ELSE comments_enabled END,
			entries_numbered = CASE WHEN $15::boolean THEN $16::boolean ELSE entries_numbered END,
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING `+listReturningColumns+listReturningAuthor+`,
		         (SELECT COUNT(*) FROM list_entries WHERE list_id = lists.id)::bigint AS item_count
	`, id, userID, name, descVal, setVis, visArg, setCover, coverArg, setShared, sharedArg, setSlug, slugArg, setComments, commentsArg, setEntriesNumbered, entriesNumberedArg)
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

// ListItemsForViewer returns items on the list in hitlist display order.
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
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$2")
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s
		FROM list_entries le
		INNER JOIN lists l ON l.id = le.list_id
		INNER JOIN items i ON i.id = le.item_id
		WHERE le.list_id = $1 AND `+vis+`
		ORDER BY le.sort_order ASC, le.created_at DESC
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

// ListEntryRow is one list_entries row for assembling v2 hitlist entries (item link or stub).
type ListEntryRow struct {
	EntryID      string
	ListID       string
	ItemID       *string
	StubTitle    *string
	StubCategory *string
	StubMeta     []byte
	Description  *string
	CreatedAt    time.Time
}

// ListEntryRowsVisible returns entries when the viewer may see the list (nil viewer = public list only).
func (r *PostgresListRepository) ListEntryRowsVisible(ctx context.Context, listID string, viewer *int64) ([]ListEntryRow, error) {
	var rows pgx.Rows
	var err error
	if viewer != nil {
		vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$2")
		rows, err = r.pool.Query(ctx, `
			SELECT le.id, le.list_id, le.item_id, le.title, le.category, le.metadata, le.description, le.created_at
			FROM list_entries le
			INNER JOIN lists l ON l.id = le.list_id
			WHERE le.list_id = $1::uuid AND `+vis+`
			ORDER BY le.sort_order ASC, le.created_at DESC
		`, listID, *viewer)
	} else {
		rows, err = r.pool.Query(ctx, `
			SELECT le.id, le.list_id, le.item_id, le.title, le.category, le.metadata, le.description, le.created_at
			FROM list_entries le
			INNER JOIN lists l ON l.id = le.list_id
			WHERE le.list_id = $1::uuid AND l.visibility = 'public'
			ORDER BY le.sort_order ASC, le.created_at DESC
		`, listID)
	}
	if err != nil {
		return nil, fmt.Errorf("list entries: %w", err)
	}
	defer rows.Close()
	out := make([]ListEntryRow, 0)
	for rows.Next() {
		var row ListEntryRow
		var itemID sql.NullString
		var title, cat, desc sql.NullString
		var meta []byte
		if err := rows.Scan(&row.EntryID, &row.ListID, &itemID, &title, &cat, &meta, &desc, &row.CreatedAt); err != nil {
			return nil, err
		}
		if itemID.Valid && strings.TrimSpace(itemID.String) != "" {
			s := strings.TrimSpace(itemID.String)
			row.ItemID = &s
		}
		if title.Valid && strings.TrimSpace(title.String) != "" {
			s := strings.TrimSpace(title.String)
			row.StubTitle = &s
		}
		if cat.Valid && strings.TrimSpace(cat.String) != "" {
			s := strings.TrimSpace(cat.String)
			row.StubCategory = &s
		}
		if len(meta) > 0 {
			row.StubMeta = meta
		}
		if desc.Valid && strings.TrimSpace(desc.String) != "" {
			s := strings.TrimSpace(desc.String)
			row.Description = &s
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// AddStubEntry inserts a metadata-only list entry (hitlist stub).
func (r *PostgresListRepository) AddStubEntry(ctx context.Context, listID string, userID int64, title string, category string, metadata []byte, description *string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return fmt.Errorf("title required")
	}
	if !models.Category(category).Valid() {
		return fmt.Errorf("invalid category")
	}
	if len(metadata) == 0 {
		metadata = []byte("{}")
	}
	var descVal interface{}
	if description != nil && strings.TrimSpace(*description) != "" {
		descVal = strings.TrimSpace(*description)
	}
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO list_entries (list_id, title, category, metadata, description, sort_order)
		SELECT $1::uuid, $2, $3, $4::jsonb, $5,
			COALESCE((SELECT MIN(le2.sort_order) FROM list_entries le2 WHERE le2.list_id = $1::uuid), 1) - 1
		FROM lists l
		WHERE l.id = $1::uuid AND (
			l.user_id = $6 OR (
				l.is_shared AND EXISTS (
					SELECT 1 FROM shelf_members sm
					WHERE sm.shelf_kind = 'list' AND sm.shelf_id = l.id AND sm.user_id = $6
				)
			)
		)
	`, listID, title, category, string(metadata), descVal, userID)
	if err != nil {
		return fmt.Errorf("add list stub: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrListNotFound
	}
	return nil
}

// RemoveEntryByID deletes one list entry when userID may mutate list content.
func (r *PostgresListRepository) RemoveEntryByID(ctx context.Context, listID, entryID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM list_entries e
		USING lists l
		WHERE e.id = $1::uuid AND e.list_id = $2::uuid AND e.list_id = l.id AND (
			l.user_id = $3 OR (
				l.is_shared AND EXISTS (
					SELECT 1 FROM shelf_members sm
					WHERE sm.shelf_kind = 'list' AND sm.shelf_id = l.id AND sm.user_id = $3
				)
			)
		)
	`, entryID, listID, userID)
	if err != nil {
		return fmt.Errorf("remove list entry: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrListEntryNotFound
	}
	return nil
}

// UpdateEntryDescription sets list_entries.description for one row (owner or shared list member).
func (r *PostgresListRepository) UpdateEntryDescription(ctx context.Context, listID, entryID string, userID int64, description *string) error {
	var descVal interface{}
	if description != nil && strings.TrimSpace(*description) != "" {
		descVal = strings.TrimSpace(*description)
	} else {
		descVal = nil
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE list_entries e SET description = $4
		FROM lists l
		WHERE e.id = $2::uuid AND e.list_id = $1::uuid AND e.list_id = l.id AND (
			l.user_id = $3 OR (
				l.is_shared AND EXISTS (
					SELECT 1 FROM shelf_members sm
					WHERE sm.shelf_kind = 'list' AND sm.shelf_id = l.id AND sm.user_id = $3
				)
			)
		)
	`, listID, entryID, userID, descVal)
	if err != nil {
		return fmt.Errorf("update list entry description: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrListEntryNotFound
	}
	return nil
}

// AddItem adds an existing item to a list when userID is the list owner or a shared member.
func (r *PostgresListRepository) AddItem(ctx context.Context, listID, itemID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO list_entries (list_id, item_id, sort_order)
		SELECT $1, $2,
			COALESCE((SELECT MIN(le2.sort_order) FROM list_entries le2 WHERE le2.list_id = $1::uuid), 1) - 1
		FROM lists l
		WHERE l.id = $1::uuid AND (
			l.user_id = $3 OR (
				l.is_shared AND EXISTS (
					SELECT 1 FROM shelf_members sm
					WHERE sm.shelf_kind = 'list' AND sm.shelf_id = l.id AND sm.user_id = $3
				)
			)
		)
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

// ReorderEntries sets sort_order to 0..n-1 for the given entry ids (top to bottom). ordered must be a permutation
// of ids on the list, and userID must be allowed to mutate list content.
func (r *PostgresListRepository) ReorderEntries(ctx context.Context, listID string, userID int64, ordered []string) error {
	if len(ordered) == 0 {
		return ErrListReorderInvalid
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("reorder entries: %w", err)
	}
	defer tx.Rollback(ctx)

	var n int
	err = tx.QueryRow(ctx, `SELECT COUNT(*) FROM list_entries WHERE list_id = $1::uuid`, listID).Scan(&n)
	if err != nil {
		return fmt.Errorf("reorder entries: %w", err)
	}
	if n != len(ordered) {
		return ErrListReorderInvalid
	}
	seen := make(map[string]struct{}, len(ordered))
	for _, raw := range ordered {
		id := strings.TrimSpace(raw)
		if id == "" {
			return ErrListReorderInvalid
		}
		if _, dup := seen[id]; dup {
			return ErrListReorderInvalid
		}
		seen[id] = struct{}{}
	}
	rows, err := tx.Query(ctx, `SELECT id::text FROM list_entries WHERE list_id = $1::uuid`, listID)
	if err != nil {
		return fmt.Errorf("reorder entries: %w", err)
	}
	defer rows.Close()
	dbSeen := make(map[string]struct{}, n)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("reorder entries: %w", err)
		}
		id = strings.TrimSpace(id)
		dbSeen[id] = struct{}{}
		if _, ok := seen[id]; !ok {
			return ErrListReorderInvalid
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("reorder entries: %w", err)
	}
	if len(dbSeen) != len(seen) {
		return ErrListReorderInvalid
	}
	for i, raw := range ordered {
		id := strings.TrimSpace(raw)
		tag, err := tx.Exec(ctx, `
			UPDATE list_entries e
			SET sort_order = $1
			FROM lists l
			WHERE e.id = $2::uuid AND e.list_id = $3::uuid AND e.list_id = l.id AND (
				l.user_id = $4 OR (
					l.is_shared AND EXISTS (
						SELECT 1 FROM shelf_members sm
						WHERE sm.shelf_kind = 'list' AND sm.shelf_id = l.id AND sm.user_id = $4
					)
				)
			)
		`, i, id, listID, userID)
		if err != nil {
			return fmt.Errorf("reorder entries: %w", err)
		}
		if tag.RowsAffected() != 1 {
			return ErrListReorderInvalid
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("reorder entries: %w", err)
	}
	return nil
}

func (r *PostgresListRepository) RemoveItem(ctx context.Context, listID, itemID string, userID int64) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM list_entries e
		USING lists l
		WHERE e.list_id = $1::uuid AND e.item_id = $2::uuid AND e.list_id = l.id AND (
			l.user_id = $3 OR (
				l.is_shared AND EXISTS (
					SELECT 1 FROM shelf_members sm
					WHERE sm.shelf_kind = 'list' AND sm.shelf_id = l.id AND sm.user_id = $3
				)
			)
		)
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
		SELECT `+listSelectWithAuthor+`, 0::bigint AS item_count
		FROM lists l
		LEFT JOIN users shelf_owner ON shelf_owner.id = l.user_id
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

// MoveEntriesToListTx copies list entry rows from fromListID to toListID (same owner). Item-linked
// rows use ON CONFLICT DO NOTHING; stub rows are copied as new rows.
func (r *PostgresListRepository) MoveEntriesToListTx(ctx context.Context, tx pgx.Tx, ownerID int64, fromListID, toListID string) error {
	_, err := tx.Exec(ctx, `
		WITH ranked AS (
			SELECT
				le.item_id,
				le.title,
				le.category,
				le.metadata,
				le.description,
				le.created_at,
				ROW_NUMBER() OVER (ORDER BY le.sort_order ASC, le.created_at ASC) AS rn
			FROM list_entries le
			INNER JOIN lists src ON src.id = le.list_id AND src.user_id = $3
			WHERE le.list_id = $2::uuid AND le.item_id IS NOT NULL
		),
		mx AS (
			SELECT COALESCE(MAX(sort_order), -1) AS m FROM list_entries WHERE list_id = $1::uuid
		)
		INSERT INTO list_entries (list_id, item_id, title, category, metadata, description, created_at, sort_order)
		SELECT $1::uuid, r.item_id, r.title, r.category, r.metadata, r.description, r.created_at, mx.m + r.rn
		FROM ranked r
		CROSS JOIN mx
		INNER JOIN lists dst ON dst.id = $1::uuid AND dst.user_id = $3
		ON CONFLICT (list_id, item_id) WHERE item_id IS NOT NULL DO NOTHING
	`, toListID, fromListID, ownerID)
	if err != nil {
		return fmt.Errorf("move list entries: %w", err)
	}
	_, err = tx.Exec(ctx, `
		WITH ranked AS (
			SELECT
				le.title,
				le.category,
				le.metadata,
				le.description,
				le.created_at,
				ROW_NUMBER() OVER (ORDER BY le.sort_order ASC, le.created_at ASC) AS rn
			FROM list_entries le
			INNER JOIN lists src ON src.id = le.list_id AND src.user_id = $3
			WHERE le.list_id = $2::uuid AND le.item_id IS NULL
		),
		mx AS (
			SELECT COALESCE(MAX(sort_order), -1) AS m FROM list_entries WHERE list_id = $1::uuid
		)
		INSERT INTO list_entries (list_id, item_id, title, category, metadata, description, created_at, sort_order)
		SELECT $1::uuid, NULL, r.title, r.category, r.metadata, r.description, r.created_at, mx.m + r.rn
		FROM ranked r
		CROSS JOIN mx
		INNER JOIN lists dst ON dst.id = $1::uuid AND dst.user_id = $3
	`, toListID, fromListID, ownerID)
	if err != nil {
		return fmt.Errorf("move list stub entries: %w", err)
	}
	return nil
}

// ListRefsContainingItemForViewer returns lists that include this item and are visible to the viewer
// (their own lists or others’ public lists). When viewerID is nil, only public lists are returned.
func (r *PostgresListRepository) ListRefsContainingItemForViewer(ctx context.Context, itemID string, viewerID *int64) ([]models.ListRef, error) {
	var rows pgx.Rows
	var err error
	if viewerID != nil {
		vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$2")
		rows, err = r.pool.Query(ctx, `
			SELECT l.id::text, l.name, l.cover_art_url, l.slug, l.visibility::text
			FROM list_entries le
			INNER JOIN lists l ON l.id = le.list_id
			WHERE le.item_id = $1::uuid AND `+vis+`
			ORDER BY l.name ASC
		`, itemID, *viewerID)
	} else {
		rows, err = r.pool.Query(ctx, `
			SELECT l.id::text, l.name, l.cover_art_url, l.slug, l.visibility::text
			FROM list_entries le
			INNER JOIN lists l ON l.id = le.list_id
			WHERE le.item_id = $1::uuid AND l.visibility = 'public'
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
		var cover, slug sql.NullString
		var vis string
		if err := rows.Scan(&ref.ID, &ref.Name, &cover, &slug, &vis); err != nil {
			return nil, err
		}
		if cover.Valid && strings.TrimSpace(cover.String) != "" {
			s := strings.TrimSpace(cover.String)
			ref.CoverArtURL = &s
		}
		if slug.Valid && strings.TrimSpace(slug.String) != "" {
			s := strings.TrimSpace(slug.String)
			ref.Slug = &s
		}
		ref.Visibility = models.Visibility(vis)
		if !ref.Visibility.Valid() {
			ref.Visibility = models.DefaultVisibility
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
