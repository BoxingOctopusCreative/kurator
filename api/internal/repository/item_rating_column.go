package repository

import (
	"context"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

// itemsTableHasRatingColumn reports whether public.items has a rating column (migration 014).
// Result is cached per pool for the process lifetime.
func itemsTableHasRatingColumn(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	if v, ok := itemsRatingColCache.Load(pool); ok {
		return v.(bool), nil
	}
	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'rating'
		)`).Scan(&exists)
	if err != nil {
		return false, err
	}
	itemsRatingColCache.Store(pool, exists)
	return exists, nil
}

var itemsRatingColCache sync.Map // *pgxpool.Pool -> bool
