package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OnboardingShelfProgress summarizes the user's newest owned collection or wishlist for onboarding UI.
type OnboardingShelfProgress struct {
	ShelfID    string
	ItemCount  int64
}

type OnboardingRepository struct {
	pool *pgxpool.Pool
}

func NewOnboardingRepository(pool *pgxpool.Pool) *OnboardingRepository {
	return &OnboardingRepository{pool: pool}
}

func (r *OnboardingRepository) LatestCollectionProgress(ctx context.Context, userID int64) (*OnboardingShelfProgress, error) {
	var id string
	var count int64
	err := r.pool.QueryRow(ctx, `
		SELECT c.id::text,
			(SELECT COUNT(*)::bigint FROM items i WHERE i.collection_id = c.id)
		FROM collections c
		WHERE c.user_id = $1
		ORDER BY c.created_at DESC
		LIMIT 1
	`, userID).Scan(&id, &count)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &OnboardingShelfProgress{ShelfID: id, ItemCount: count}, nil
}

func (r *OnboardingRepository) LatestWishlistProgress(ctx context.Context, userID int64) (*OnboardingShelfProgress, error) {
	var id string
	var count int64
	err := r.pool.QueryRow(ctx, `
		SELECT w.id::text,
			(SELECT COUNT(*)::bigint FROM wishlist_entries e WHERE e.wishlist_id = w.id)
		FROM wishlists w
		WHERE w.user_id = $1
		ORDER BY w.created_at DESC
		LIMIT 1
	`, userID).Scan(&id, &count)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &OnboardingShelfProgress{ShelfID: id, ItemCount: count}, nil
}

func (r *OnboardingRepository) HasCollectionWithMinItems(ctx context.Context, userID int64, min int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM collections c
			WHERE c.user_id = $1
			  AND (SELECT COUNT(*) FROM items i WHERE i.collection_id = c.id) >= $2
		)
	`, userID, min).Scan(&ok)
	return ok, err
}

func (r *OnboardingRepository) HasWishlistWithMinEntries(ctx context.Context, userID int64, min int64) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM wishlists w
			WHERE w.user_id = $1
			  AND (SELECT COUNT(*) FROM wishlist_entries e WHERE e.wishlist_id = w.id) >= $2
		)
	`, userID, min).Scan(&ok)
	return ok, err
}
