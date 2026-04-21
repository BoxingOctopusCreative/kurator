package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/jackc/pgx/v5"
)

// ErrCollectionCategoryMismatch is returned when an item's category does not match a shelf that is locked to one category.
var ErrCollectionCategoryMismatch = errors.New("this shelf accepts one category; use a matching type or another shelf")

// TxLockCollectionCategory loads and row-locks a collection's category column (must run inside a transaction).
func TxLockCollectionCategory(ctx context.Context, tx pgx.Tx, collectionID string) (*models.Category, error) {
	var cat sql.NullString
	err := tx.QueryRow(ctx, `SELECT category FROM collections WHERE id = $1 FOR UPDATE`, collectionID).Scan(&cat)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCollectionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lock collection category: %w", err)
	}
	if !cat.Valid || strings.TrimSpace(cat.String) == "" {
		return nil, nil
	}
	c := models.Category(strings.TrimSpace(cat.String))
	if !c.Valid() {
		return nil, fmt.Errorf("invalid stored collection category")
	}
	return &c, nil
}

// TxAssertCollectionAcceptsItemCategory returns ErrCollectionCategoryMismatch when the shelf is pinned to another category.
func TxAssertCollectionAcceptsItemCategory(locked *models.Category, itemCat models.Category) error {
	if locked != nil && *locked != itemCat {
		return ErrCollectionCategoryMismatch
	}
	return nil
}

// TxPromoteCollectionCategoryIfUnset sets category on a shelf that does not yet have one (first item pins the shelf).
func TxPromoteCollectionCategoryIfUnset(ctx context.Context, tx pgx.Tx, collectionID string, itemCat models.Category) error {
	_, err := tx.Exec(ctx, `
		UPDATE collections SET category = $1, updated_at = NOW()
		WHERE id = $2 AND category IS NULL
	`, string(itemCat), collectionID)
	if err != nil {
		return fmt.Errorf("promote collection category: %w", err)
	}
	return nil
}
