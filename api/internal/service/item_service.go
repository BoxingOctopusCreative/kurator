package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

type ItemService struct {
	repo   repository.ItemRepository
	search SearchIndexer
}

func NewItemService(repo repository.ItemRepository, search SearchIndexer) *ItemService {
	return &ItemService{repo: repo, search: search}
}

func (s *ItemService) ListLatest(ctx context.Context, limit int) ([]models.Item, error) {
	return s.repo.ListLatest(ctx, limit)
}

func (s *ItemService) ListByCollection(ctx context.Context, collectionID int64, limit int) ([]models.Item, error) {
	return s.repo.ListByCollection(ctx, collectionID, limit)
}

func (s *ItemService) ListRecentForOwner(ctx context.Context, ownerUserID int64, limit int) ([]models.Item, error) {
	return s.repo.ListRecentForOwner(ctx, ownerUserID, limit)
}

func (s *ItemService) ListRecentFromFollowedUsers(ctx context.Context, followerUserID int64, limit int) ([]models.Item, error) {
	return s.repo.ListRecentFromFollowedUsers(ctx, followerUserID, limit)
}

func (s *ItemService) Get(ctx context.Context, id int64) (*models.Item, error) {
	return s.repo.GetByID(ctx, id)
}

type CreateItemInput struct {
	CollectionID int64
	Title        string
	Category     models.Category
	Metadata     json.RawMessage
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
	if in.CollectionID == 0 {
		in.CollectionID = 1
	}
	item, err := s.repo.Create(ctx, in.CollectionID, title, in.Category, meta)
	if err != nil {
		return nil, err
	}
	if s.search != nil {
		LogIndexError("upsert after create", s.search.UpsertItem(ctx, *item))
	}
	return item, nil
}

type UpdateItemInput struct {
	Title    string
	Category models.Category
	Metadata json.RawMessage
}

func (s *ItemService) Update(ctx context.Context, id int64, in UpdateItemInput) (*models.Item, error) {
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
	item, err := s.repo.Update(ctx, id, title, in.Category, meta)
	if err != nil {
		return nil, err
	}
	if s.search != nil {
		LogIndexError("upsert after update", s.search.UpsertItem(ctx, *item))
	}
	return item, nil
}

func (s *ItemService) Delete(ctx context.Context, id int64) error {
	if err := s.repo.Delete(ctx, id); err != nil {
		return err
	}
	if s.search != nil {
		LogIndexError("remove after delete", s.search.RemoveItem(ctx, id))
	}
	return nil
}
