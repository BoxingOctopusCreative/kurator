package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ExploreSearchRepository runs cross-entity search with visibility rules for the current viewer.
type ExploreSearchRepository struct {
	pool *pgxpool.Pool
}

func NewExploreSearchRepository(pool *pgxpool.Pool) *ExploreSearchRepository {
	return &ExploreSearchRepository{pool: pool}
}

func explorePat(q string) string {
	return "%" + q + "%"
}

func exploreLimit(limit int) int {
	if limit < 1 {
		return 5
	}
	if limit > 12 {
		return 12
	}
	return limit
}

func boardAccessibleSQL(viewerArg int) string {
	if viewerArg < 1 {
		return "b.visibility = 'public'"
	}
	ph := fmt.Sprintf("$%d", viewerArg)
	return fmt.Sprintf(`(
		b.visibility = 'public'
		OR b.owner_user_id = %s
		OR EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = %s)
	)`, ph, ph)
}

func (r *ExploreSearchRepository) SearchCollections(ctx context.Context, q string, viewer *int64, limit int) ([]models.ExploreSearchHit, error) {
	limit = exploreLimit(limit)
	pat := explorePat(q)
	var visSQL string
	args := []any{pat, pat, limit}
	if viewer == nil {
		visSQL = CollectionRowVisibleAnonSQL()
	} else {
		visSQL = CollectionRowVisibleSQL("$3")
		args = []any{pat, pat, *viewer, limit}
	}
	query := fmt.Sprintf(`
		SELECT c.id::text, c.name, COALESCE(NULLIF(BTRIM(c.description), ''), '')
		FROM collections c
		WHERE %s AND (c.name ILIKE $1 OR COALESCE(c.description, '') ILIKE $2)
		ORDER BY c.name ASC
		LIMIT %s
	`, visSQL, fmt.Sprintf("$%d", len(args)))
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("explore search collections: %w", err)
	}
	defer rows.Close()
	return scanExploreShelfHits(rows, "collection", "/collections/")
}

func (r *ExploreSearchRepository) SearchHitlists(ctx context.Context, q string, viewer *int64, limit int) ([]models.ExploreSearchHit, error) {
	limit = exploreLimit(limit)
	pat := explorePat(q)
	var visSQL string
	args := []any{pat, pat, limit}
	if viewer == nil {
		visSQL = "l.visibility = 'public'"
	} else {
		visSQL = "l.visibility <> 'private' AND (" + OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$3") + ")"
		args = []any{pat, pat, *viewer, limit}
	}
	query := fmt.Sprintf(`
		SELECT l.id::text, l.name, COALESCE(NULLIF(BTRIM(l.description), ''), '')
		FROM lists l
		WHERE %s AND (l.name ILIKE $1 OR COALESCE(l.description, '') ILIKE $2)
		ORDER BY l.name ASC
		LIMIT %s
	`, visSQL, fmt.Sprintf("$%d", len(args)))
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("explore search hitlists: %w", err)
	}
	defer rows.Close()
	return scanExploreShelfHits(rows, "hitlist", "/lists/")
}

func (r *ExploreSearchRepository) SearchWishlists(ctx context.Context, q string, viewer *int64, limit int) ([]models.ExploreSearchHit, error) {
	limit = exploreLimit(limit)
	pat := explorePat(q)
	var visSQL string
	args := []any{pat, pat, limit}
	if viewer == nil {
		visSQL = "w.visibility = 'public'"
	} else {
		visSQL = OwnedShelfVisibleToViewerOrSharedMemberSQL("w.user_id", "w.visibility", "w.is_shared", "wishlist", "w.id", "$3")
		args = []any{pat, pat, *viewer, limit}
	}
	query := fmt.Sprintf(`
		SELECT w.id::text, w.name, COALESCE(NULLIF(BTRIM(w.description), ''), '')
		FROM wishlists w
		WHERE %s AND (w.name ILIKE $1 OR COALESCE(w.description, '') ILIKE $2)
		ORDER BY w.name ASC
		LIMIT %s
	`, visSQL, fmt.Sprintf("$%d", len(args)))
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("explore search wishlists: %w", err)
	}
	defer rows.Close()
	return scanExploreShelfHits(rows, "wishlist", "/wishlists/")
}

func scanExploreShelfHits(rows pgx.Rows, kind, pathPrefix string) ([]models.ExploreSearchHit, error) {
	out := make([]models.ExploreSearchHit, 0)
	for rows.Next() {
		var id, name, desc string
		if err := rows.Scan(&id, &name, &desc); err != nil {
			return nil, err
		}
		var sub *string
		if desc != "" {
			sub = &desc
		}
		out = append(out, models.ExploreSearchHit{
			Kind:     kind,
			ID:       id,
			Title:    name,
			Subtitle: sub,
			URL:      pathPrefix + id,
		})
	}
	return out, rows.Err()
}

func (r *ExploreSearchRepository) SearchBoards(ctx context.Context, q string, viewer *int64, limit int) ([]models.ExploreSearchHit, error) {
	limit = exploreLimit(limit)
	pat := explorePat(q)
	args := []any{pat, pat, limit}
	access := boardAccessibleSQL(0)
	if viewer != nil && *viewer > 0 {
		args = []any{pat, pat, *viewer, limit}
		access = boardAccessibleSQL(3)
	}
	query := fmt.Sprintf(`
		SELECT b.id::text, b.name, COALESCE(NULLIF(BTRIM(b.description), ''), ''), b.slug
		FROM boards b
		WHERE %s AND (b.name ILIKE $1 OR COALESCE(b.description, '') ILIKE $2)
		ORDER BY b.name ASC
		LIMIT %s
	`, access, fmt.Sprintf("$%d", len(args)))
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("explore search boards: %w", err)
	}
	defer rows.Close()
	out := make([]models.ExploreSearchHit, 0)
	for rows.Next() {
		var id, name, desc, slug string
		if err := rows.Scan(&id, &name, &desc, &slug); err != nil {
			return nil, err
		}
		var sub *string
		if desc != "" {
			sub = &desc
		}
		out = append(out, models.ExploreSearchHit{
			Kind:     "board",
			ID:       id,
			Title:    name,
			Subtitle: sub,
			URL:      "/boards/" + slug,
		})
	}
	return out, rows.Err()
}

func (r *ExploreSearchRepository) SearchThreads(ctx context.Context, q string, viewer *int64, limit int) ([]models.ExploreSearchHit, error) {
	limit = exploreLimit(limit)
	pat := explorePat(q)
	args := []any{pat, pat, limit}
	access := boardAccessibleSQL(0)
	if viewer != nil && *viewer > 0 {
		args = []any{pat, pat, *viewer, limit}
		access = boardAccessibleSQL(3)
	}
	query := fmt.Sprintf(`
		SELECT t.id::text, t.title, b.name, b.slug
		FROM board_threads t
		JOIN boards b ON b.id = t.board_id
		WHERE %s AND (t.title ILIKE $1 OR t.body ILIKE $2)
		ORDER BY t.updated_at DESC
		LIMIT %s
	`, access, fmt.Sprintf("$%d", len(args)))
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("explore search threads: %w", err)
	}
	defer rows.Close()
	out := make([]models.ExploreSearchHit, 0)
	for rows.Next() {
		var id, title, boardName, slug string
		if err := rows.Scan(&id, &title, &boardName, &slug); err != nil {
			return nil, err
		}
		sub := boardName
		out = append(out, models.ExploreSearchHit{
			Kind:     "thread",
			ID:       id,
			Title:    title,
			Subtitle: &sub,
			URL:      "/boards/" + slug + "/threads/" + id,
		})
	}
	return out, rows.Err()
}

func (r *ExploreSearchRepository) SearchReplies(ctx context.Context, q string, viewer *int64, limit int) ([]models.ExploreSearchHit, error) {
	limit = exploreLimit(limit)
	pat := explorePat(q)
	args := []any{pat, limit}
	access := boardAccessibleSQL(0)
	if viewer != nil && *viewer > 0 {
		args = []any{pat, *viewer, limit}
		access = boardAccessibleSQL(2)
	}
	query := fmt.Sprintf(`
		SELECT r.id::text, LEFT(r.body, 120), t.title, b.slug, t.id::text
		FROM board_replies r
		JOIN board_threads t ON t.id = r.thread_id
		JOIN boards b ON b.id = t.board_id
		WHERE %s AND r.body ILIKE $1
		ORDER BY r.created_at DESC
		LIMIT %s
	`, access, fmt.Sprintf("$%d", len(args)))
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("explore search replies: %w", err)
	}
	defer rows.Close()
	out := make([]models.ExploreSearchHit, 0)
	for rows.Next() {
		var id, snippet, threadTitle, slug, threadID string
		if err := rows.Scan(&id, &snippet, &threadTitle, &slug, &threadID); err != nil {
			return nil, err
		}
		snippet = strings.TrimSpace(snippet)
		sub := threadTitle
		out = append(out, models.ExploreSearchHit{
			Kind:     "reply",
			ID:       id,
			Title:    snippet,
			Subtitle: &sub,
			URL:      "/boards/" + slug + "/threads/" + threadID,
		})
	}
	return out, rows.Err()
}

func (r *ExploreSearchRepository) SearchHitlistComments(ctx context.Context, q string, viewer *int64, limit int) ([]models.ExploreSearchHit, error) {
	limit = exploreLimit(limit)
	pat := explorePat(q)
	var visSQL string
	args := []any{pat, limit}
	if viewer == nil {
		visSQL = "l.visibility = 'public'"
	} else {
		visSQL = "l.visibility <> 'private' AND (" + OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", "$2") + ")"
		args = []any{pat, *viewer, limit}
	}
	query := fmt.Sprintf(`
		SELECT c.id::text, LEFT(c.body, 120), l.name, l.id::text
		FROM hitlist_comments c
		JOIN lists l ON l.id = c.list_id
		WHERE %s AND c.body ILIKE $1
		ORDER BY c.created_at DESC
		LIMIT %s
	`, visSQL, fmt.Sprintf("$%d", len(args)))
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("explore search hitlist comments: %w", err)
	}
	defer rows.Close()
	out := make([]models.ExploreSearchHit, 0)
	for rows.Next() {
		var id, snippet, listName, listID string
		if err := rows.Scan(&id, &snippet, &listName, &listID); err != nil {
			return nil, err
		}
		snippet = strings.TrimSpace(snippet)
		sub := listName
		out = append(out, models.ExploreSearchHit{
			Kind:     "hitlist_comment",
			ID:       id,
			Title:    snippet,
			Subtitle: &sub,
			URL:      "/lists/" + listID,
		})
	}
	return out, rows.Err()
}
