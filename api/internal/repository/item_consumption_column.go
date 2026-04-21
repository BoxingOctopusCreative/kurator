package repository

import (
	"context"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

// itemsTableHasConsumptionStatusColumn reports whether public.items has consumption_status (migration 016).
func itemsTableHasConsumptionStatusColumn(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	if v, ok := itemsConsumptionColCache.Load(pool); ok {
		return v.(bool), nil
	}
	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'consumption_status'
		)`).Scan(&exists)
	if err != nil {
		return false, err
	}
	itemsConsumptionColCache.Store(pool, exists)
	return exists, nil
}

var itemsConsumptionColCache sync.Map // *pgxpool.Pool -> bool
