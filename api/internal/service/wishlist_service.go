package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

type WishlistService struct {
	wishlist *repository.PostgresWishlistRepository
	coll     *repository.PostgresCollectionRepository
	search   SearchIndexer
}

func NewWishlistService(
	w *repository.PostgresWishlistRepository,
	coll *repository.PostgresCollectionRepository,
	search SearchIndexer,
) *WishlistService {
	return &WishlistService{wishlist: w, coll: coll, search: search}
}

func (s *WishlistService) List(ctx context.Context, userID int64) ([]models.Wishlist, error) {
	return s.wishlist.ListForViewer(ctx, userID)
}

func (s *WishlistService) Get(ctx context.Context, id, userID int64) (*models.Wishlist, error) {
	return s.wishlist.GetByIDForViewer(ctx, id, userID)
}

func (s *WishlistService) Create(ctx context.Context, userID int64, name, description string, targetCollectionID *int64, isPublic *bool) (*models.Wishlist, error) {
	if err := s.validateTargetCollection(ctx, userID, targetCollectionID); err != nil {
		return nil, err
	}
	n, err := validation.CollectionOrWishlistName(name, "Name")
	if err != nil {
		return nil, err
	}
	desc, err := validation.CollectionDescription(description)
	if err != nil {
		return nil, err
	}
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}
	pub := true
	if isPublic != nil {
		pub = *isPublic
	}
	return s.wishlist.Create(ctx, userID, n, descPtr, targetCollectionID, pub)
}

func (s *WishlistService) Update(ctx context.Context, userID, id int64, name, description string, targetCollectionID *int64, isPublic *bool) (*models.Wishlist, error) {
	if err := s.validateTargetCollection(ctx, userID, targetCollectionID); err != nil {
		return nil, err
	}
	n, err := validation.CollectionOrWishlistName(name, "Name")
	if err != nil {
		return nil, err
	}
	desc, err := validation.CollectionDescription(description)
	if err != nil {
		return nil, err
	}
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}
	return s.wishlist.UpdateFull(ctx, id, userID, n, descPtr, targetCollectionID, isPublic)
}

func (s *WishlistService) Delete(ctx context.Context, id, userID int64) error {
	return s.wishlist.Delete(ctx, id, userID)
}

func (s *WishlistService) ListEntries(ctx context.Context, wishlistID, userID int64) ([]models.WishlistEntry, error) {
	if _, err := s.wishlist.GetByIDForViewer(ctx, wishlistID, userID); err != nil {
		return nil, err
	}
	return s.wishlist.ListEntries(ctx, wishlistID, userID)
}

func (s *WishlistService) AddEntry(ctx context.Context, wishlistID, userID int64, title string, category models.Category, metadata json.RawMessage) (*models.WishlistEntry, error) {
	if _, err := s.wishlist.GetByIDForUser(ctx, wishlistID, userID); err != nil {
		return nil, err
	}
	if !category.Valid() {
		return nil, fmt.Errorf("invalid category")
	}
	t, err := validation.ItemTitle(title)
	if err != nil {
		return nil, err
	}
	meta, err := validation.SanitizeItemMetadata(category, metadata)
	if err != nil {
		return nil, err
	}
	return s.wishlist.CreateEntry(ctx, wishlistID, userID, t, category, meta)
}

func (s *WishlistService) DeleteEntry(ctx context.Context, wishlistID, entryID, userID int64) error {
	if _, err := s.wishlist.GetByIDForUser(ctx, wishlistID, userID); err != nil {
		return err
	}
	return s.wishlist.DeleteEntry(ctx, wishlistID, entryID, userID)
}

// Obtain creates a collection item from the wishlist entry and removes the entry.
func (s *WishlistService) Obtain(ctx context.Context, userID, wishlistID, entryID int64, collectionID *int64) (*models.Item, error) {
	wl, err := s.wishlist.GetByIDForUser(ctx, wishlistID, userID)
	if err != nil {
		return nil, err
	}
	var cid int64
	if collectionID != nil && *collectionID > 0 {
		cid = *collectionID
	} else if wl.TargetCollectionID != nil && *wl.TargetCollectionID > 0 {
		cid = *wl.TargetCollectionID
	} else {
		return nil, fmt.Errorf("choose a destination collection or set this wishlist's linked collection")
	}
	if _, err := s.coll.GetByID(ctx, cid, &userID); err != nil {
		if errors.Is(err, repository.ErrCollectionNotFound) {
			return nil, err
		}
		return nil, err
	}
	item, err := s.wishlist.ObtainEntry(ctx, wishlistID, entryID, userID, cid)
	if err != nil {
		return nil, err
	}
	if s.search != nil {
		LogIndexError("upsert after wishlist obtain", s.search.UpsertItem(ctx, *item))
	}
	return item, nil
}

func (s *WishlistService) validateTargetCollection(ctx context.Context, userID int64, targetCollectionID *int64) error {
	if targetCollectionID == nil || *targetCollectionID < 1 {
		return nil
	}
	_, err := s.coll.GetByID(ctx, *targetCollectionID, &userID)
	if err != nil {
		if errors.Is(err, repository.ErrCollectionNotFound) {
			return fmt.Errorf("collection not found or not accessible")
		}
		return err
	}
	return nil
}
