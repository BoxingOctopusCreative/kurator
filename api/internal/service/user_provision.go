package service

import (
	"context"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
)

const starterCollectionName = "My Collection"

// ProvisionNewUser creates a starter collection when the account has none (so item create can resolve a default shelf).
func ProvisionNewUser(ctx context.Context, coll *repository.PostgresCollectionRepository, userID int64) error {
	if coll == nil || userID < 1 {
		return nil
	}
	if _, err := coll.ResolveDefaultCollectionForItemCreate(ctx, userID); err == nil {
		return nil
	} else if !strings.Contains(err.Error(), "no collection available") {
		return err
	}
	cat := models.CategoryGame
	_, err := coll.Create(ctx, userID, starterCollectionName, nil, models.DefaultVisibility, &cat, false)
	return err
}
