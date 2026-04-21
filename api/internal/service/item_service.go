package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

type ItemService struct {
	repo   repository.ItemRepository
	coll   *repository.PostgresCollectionRepository
	search SearchIndexer
}

func NewItemService(repo repository.ItemRepository, coll *repository.PostgresCollectionRepository, search SearchIndexer) *ItemService {
	return &ItemService{repo: repo, coll: coll, search: search}
}

func (s *ItemService) ListLatest(ctx context.Context, limit int) ([]models.Item, error) {
	return s.repo.ListLatest(ctx, limit)
}

func (s *ItemService) ListByCollection(ctx context.Context, collectionID string, limit int, consumptionFilter string) ([]models.Item, error) {
	return s.repo.ListByCollection(ctx, collectionID, limit, consumptionFilter)
}

func (s *ItemService) ListRecentForOwner(ctx context.Context, ownerUserID int64, limit int) ([]models.Item, error) {
	return s.repo.ListRecentForOwner(ctx, ownerUserID, limit)
}

func (s *ItemService) ListRecentFromFollowedUsers(ctx context.Context, followerUserID int64, limit int) ([]models.Item, error) {
	return s.repo.ListRecentFromFollowedUsers(ctx, followerUserID, limit)
}

func (s *ItemService) Get(ctx context.Context, id string) (*models.Item, error) {
	return s.repo.GetByID(ctx, id)
}

type CreateItemInput struct {
	CollectionID string
	Title          string
	Category       models.Category
	Metadata       json.RawMessage
	Rating         *int
	Consumption    *models.ConsumptionStatus
}

func (s *ItemService) Create(ctx context.Context, in CreateItemInput) (*models.Item, error) {
	if !in.Category.Valid() {
		return nil, fmt.Errorf("invalid category")
	}
	title, err := validation.ItemTitle(in.Title)
	if err != nil {
		return nil, err
	}
	meta, err := validation.SanitizeItemMetadata(in.Category, in.Metadata)
	if err != nil {
		return nil, err
	}
	rating, err := validation.OptionalItemRating(in.Rating)
	if err != nil {
		return nil, err
	}
	cons, err := validation.OptionalConsumptionStatus(in.Consumption)
	if err != nil {
		return nil, err
	}
	if in.CollectionID == "" {
		return nil, fmt.Errorf("collection_id is required")
	}
	var item *models.Item
	if s.coll == nil {
		item, err = s.repo.Create(ctx, in.CollectionID, title, in.Category, meta, rating, cons)
	} else {
		tx, berr := s.coll.BeginTx(ctx)
		if berr != nil {
			return nil, berr
		}
		defer func() { _ = tx.Rollback(ctx) }()
		locked, lerr := repository.TxLockCollectionCategory(ctx, tx, in.CollectionID)
		if lerr != nil {
			return nil, lerr
		}
		if aerr := repository.TxAssertCollectionAcceptsItemCategory(locked, in.Category); aerr != nil {
			return nil, aerr
		}
		item, err = s.repo.CreateTx(ctx, tx, in.CollectionID, title, in.Category, meta, rating, cons)
		if err != nil {
			return nil, err
		}
		if perr := repository.TxPromoteCollectionCategoryIfUnset(ctx, tx, in.CollectionID, in.Category); perr != nil {
			return nil, perr
		}
		if cerr := tx.Commit(ctx); cerr != nil {
			return nil, cerr
		}
	}
	if err != nil {
		return nil, err
	}
	if s.search != nil {
		LogIndexError("upsert after create", s.search.UpsertItem(ctx, *item))
	}
	return item, nil
}

type UpdateItemInput struct {
	Title            string
	Category         models.Category
	Metadata         json.RawMessage
	Rating           *models.RatingUpdate
	Consumption      *models.ConsumptionStatus
	NewCollectionID *string
}

func validateRatingUpdate(ru *models.RatingUpdate) error {
	if ru == nil {
		return nil
	}
	if ru.SetNull {
		return nil
	}
	if ru.Stars < 1 || ru.Stars > 5 {
		return fmt.Errorf("rating must be between 1 and 5")
	}
	return nil
}

func (s *ItemService) Update(ctx context.Context, id string, in UpdateItemInput) (*models.Item, error) {
	if !in.Category.Valid() {
		return nil, fmt.Errorf("invalid category")
	}
	title, err := validation.ItemTitle(in.Title)
	if err != nil {
		return nil, err
	}
	meta, err := validation.SanitizeItemMetadata(in.Category, in.Metadata)
	if err != nil {
		return nil, err
	}
	if err := validateRatingUpdate(in.Rating); err != nil {
		return nil, err
	}
	cons, err := validation.OptionalConsumptionStatus(in.Consumption)
	if err != nil {
		return nil, err
	}
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	targetCollID := existing.CollectionID
	if in.NewCollectionID != nil && strings.TrimSpace(*in.NewCollectionID) != "" {
		targetCollID = strings.TrimSpace(*in.NewCollectionID)
	}
	var item *models.Item
	if s.coll == nil {
		item, err = s.repo.Update(ctx, id, title, in.Category, meta, in.Rating, cons, in.NewCollectionID)
	} else {
		tx, berr := s.coll.BeginTx(ctx)
		if berr != nil {
			return nil, berr
		}
		defer func() { _ = tx.Rollback(ctx) }()
		locked, lerr := repository.TxLockCollectionCategory(ctx, tx, targetCollID)
		if lerr != nil {
			return nil, lerr
		}
		if aerr := repository.TxAssertCollectionAcceptsItemCategory(locked, in.Category); aerr != nil {
			return nil, aerr
		}
		item, err = s.repo.UpdateTx(ctx, tx, id, title, in.Category, meta, in.Rating, cons, in.NewCollectionID)
		if err != nil {
			return nil, err
		}
		if perr := repository.TxPromoteCollectionCategoryIfUnset(ctx, tx, targetCollID, in.Category); perr != nil {
			return nil, perr
		}
		if cerr := tx.Commit(ctx); cerr != nil {
			return nil, cerr
		}
	}
	if err != nil {
		return nil, err
	}
	if s.search != nil {
		LogIndexError("upsert after update", s.search.UpsertItem(ctx, *item))
	}
	return item, nil
}

func (s *ItemService) Delete(ctx context.Context, id string) error {
	if err := s.repo.Delete(ctx, id); err != nil {
		return err
	}
	if s.search != nil {
		LogIndexError("remove after delete", s.search.RemoveItem(ctx, id))
	}
	return nil
}
