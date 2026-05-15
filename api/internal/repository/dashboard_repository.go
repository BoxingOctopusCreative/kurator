package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresDashboardRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresDashboardRepository(pool *pgxpool.Pool) *PostgresDashboardRepository {
	return &PostgresDashboardRepository{pool: pool}
}

// DashboardScope selects which shelves participate in the unified feed.
type DashboardScope string

const (
	// DashboardScopeMine restricts to shelves owned by the viewer.
	DashboardScopeMine DashboardScope = "mine"
	// DashboardScopeFollowing restricts to shelves owned by users the viewer follows
	// and that the viewer is allowed to see (visibility / shared-member rules).
	DashboardScopeFollowing DashboardScope = "following"
)

// RecentShelvesParams configures ListRecentShelves.
type RecentShelvesParams struct {
	ViewerUserID int64
	Scope        DashboardScope
	// Kinds filters which shelf kinds are included. Empty = all three.
	Kinds  []ShelfKind
	Limit  int
	Offset int
}

// ListRecentShelves returns up to Limit shelves matching the scope and kind filter, ordered by
// updated_at DESC. Each row carries a discriminator (kind) and per-kind item/entry counts.
func (r *PostgresDashboardRepository) ListRecentShelves(ctx context.Context, p RecentShelvesParams) ([]models.DashboardShelf, error) {
	if p.ViewerUserID < 1 {
		return nil, fmt.Errorf("viewer user id required")
	}
	if p.Limit <= 0 || p.Limit > 50 {
		p.Limit = 10
	}
	if p.Offset < 0 {
		p.Offset = 0
	}
	kinds := dedupeKinds(p.Kinds)
	if len(kinds) == 0 {
		kinds = []ShelfKind{ShelfKindCollection, ShelfKindList, ShelfKindWishlist}
	}

	parts := make([]string, 0, len(kinds))
	for _, k := range kinds {
		switch k {
		case ShelfKindCollection:
			parts = append(parts, collectionSubquery(p.Scope))
		case ShelfKindList:
			parts = append(parts, listSubquery(p.Scope))
		case ShelfKindWishlist:
			parts = append(parts, wishlistSubquery(p.Scope))
		}
	}
	if len(parts) == 0 {
		return []models.DashboardShelf{}, nil
	}
	union := strings.Join(parts, "\n  UNION ALL\n")
	sqlText := fmt.Sprintf(`
		SELECT kind, id, user_id, author_username, author_display_name, author_avatar_url,
		       name, description, cover_art_url, category, visibility, is_shared,
		       item_count, entry_count, created_at, updated_at
		FROM (
		  %s
		) AS shelves
		ORDER BY updated_at DESC
		LIMIT $2 OFFSET $3
	`, union)

	rows, err := r.pool.Query(ctx, sqlText, p.ViewerUserID, p.Limit, p.Offset)
	if err != nil {
		return nil, fmt.Errorf("dashboard shelves: %w", err)
	}
	defer rows.Close()

	out := make([]models.DashboardShelf, 0, p.Limit)
	for rows.Next() {
		var s models.DashboardShelf
		var auUser, auDn, auAv sql.NullString
		var desc, cover, cat sql.NullString
		var vis string
		if err := rows.Scan(
			&s.Kind, &s.ID, &s.UserID, &auUser, &auDn, &auAv,
			&s.Name, &desc, &cover, &cat, &vis, &s.IsShared,
			&s.ItemCount, &s.EntryCount, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan dashboard shelf: %w", err)
		}
		s.Author = shelfAuthorPtr(auUser, auDn, auAv)
		if desc.Valid {
			d := desc.String
			s.Description = &d
		}
		if cover.Valid && strings.TrimSpace(cover.String) != "" {
			c := strings.TrimSpace(cover.String)
			s.CoverArtURL = &c
		}
		if cat.Valid && strings.TrimSpace(cat.String) != "" {
			cc := models.Category(strings.TrimSpace(cat.String))
			if cc.Valid() {
				s.Category = &cc
			}
		}
		s.Visibility = models.Visibility(vis)
		if !s.Visibility.Valid() {
			s.Visibility = models.DefaultVisibility
		}
		s.IsPublic = s.Visibility.IsPublic()
		out = append(out, s)
	}
	return out, rows.Err()
}

func dedupeKinds(in []ShelfKind) []ShelfKind {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[ShelfKind]struct{}, len(in))
	out := make([]ShelfKind, 0, len(in))
	for _, k := range in {
		if _, ok := seen[k]; ok {
			continue
		}
		switch k {
		case ShelfKindCollection, ShelfKindList, ShelfKindWishlist:
			seen[k] = struct{}{}
			out = append(out, k)
		}
	}
	return out
}

// scopeWhereOwned returns the WHERE fragment for "mine": shelf owned by the viewer.
// $1 binds the viewer id; tableAlias is the alias used in the subquery (e.g. "c").
func scopeWhereOwned(tableAlias string) string {
	return tableAlias + ".user_id = $1"
}

// scopeWhereFollowing returns the WHERE fragment for "following": shelf owned by someone the
// viewer follows (not self) and visible under the usual rules (visibility tri-state, with
// shared-member fallback for collaborators).
func scopeWhereFollowing(tableAlias, isSharedCol, shelfKind string) string {
	visExpr := OwnedShelfVisibleToViewerOrSharedMemberSQL(
		tableAlias+".user_id",
		tableAlias+".visibility",
		isSharedCol,
		shelfKind,
		tableAlias+".id",
		"$1",
	)
	return fmt.Sprintf(
		"%s.user_id IS NOT NULL AND %s.user_id <> $1 AND %s.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1) AND %s",
		tableAlias, tableAlias, tableAlias, visExpr,
	)
}

func scopePredicate(scope DashboardScope, tableAlias, isSharedCol, shelfKind string) string {
	if scope == DashboardScopeFollowing {
		return scopeWhereFollowing(tableAlias, isSharedCol, shelfKind)
	}
	return scopeWhereOwned(tableAlias)
}

func collectionSubquery(scope DashboardScope) string {
	where := scopePredicate(scope, "c", "c.is_shared", "collection")
	return `
		SELECT 'collection'::text AS kind,
		       c.id::text AS id,
		       c.user_id AS user_id,
		       owner.username AS author_username,
		       owner.display_name AS author_display_name,
		       owner.avatar_url AS author_avatar_url,
		       c.name AS name,
		       c.description AS description,
		       c.cover_art_url AS cover_art_url,
		       c.category::text AS category,
		       c.visibility::text AS visibility,
		       c.is_shared AS is_shared,
		       COALESCE((SELECT COUNT(*) FROM items i WHERE i.collection_id = c.id), 0)::bigint AS item_count,
		       0::bigint AS entry_count,
		       c.created_at AS created_at,
		       c.updated_at AS updated_at
		FROM collections c
		LEFT JOIN users owner ON owner.id = c.user_id
		WHERE c.user_id IS NOT NULL AND ` + where
}

func listSubquery(scope DashboardScope) string {
	where := scopePredicate(scope, "l", "l.is_shared", "list")
	return `
		SELECT 'list'::text AS kind,
		       l.id::text AS id,
		       l.user_id AS user_id,
		       owner.username AS author_username,
		       owner.display_name AS author_display_name,
		       owner.avatar_url AS author_avatar_url,
		       l.name AS name,
		       l.description AS description,
		       l.cover_art_url AS cover_art_url,
		       NULL::text AS category,
		       l.visibility::text AS visibility,
		       l.is_shared AS is_shared,
		       COALESCE((SELECT COUNT(*) FROM list_entries le WHERE le.list_id = l.id), 0)::bigint AS item_count,
		       0::bigint AS entry_count,
		       l.created_at AS created_at,
		       l.updated_at AS updated_at
		FROM lists l
		LEFT JOIN users owner ON owner.id = l.user_id
		WHERE ` + where
}

func wishlistSubquery(scope DashboardScope) string {
	where := scopePredicate(scope, "w", "w.is_shared", "wishlist")
	return `
		SELECT 'wishlist'::text AS kind,
		       w.id::text AS id,
		       w.user_id AS user_id,
		       owner.username AS author_username,
		       owner.display_name AS author_display_name,
		       owner.avatar_url AS author_avatar_url,
		       w.name AS name,
		       w.description AS description,
		       w.cover_art_url AS cover_art_url,
		       NULL::text AS category,
		       w.visibility::text AS visibility,
		       w.is_shared AS is_shared,
		       0::bigint AS item_count,
		       COALESCE((SELECT COUNT(*) FROM wishlist_entries we WHERE we.wishlist_id = w.id), 0)::bigint AS entry_count,
		       w.created_at AS created_at,
		       w.updated_at AS updated_at
		FROM wishlists w
		LEFT JOIN users owner ON owner.id = w.user_id
		WHERE ` + where
}
