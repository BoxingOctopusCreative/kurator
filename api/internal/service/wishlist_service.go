package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/jackc/pgx/v5"
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

func (s *WishlistService) Get(ctx context.Context, id string, userID int64) (*models.Wishlist, error) {
	return s.wishlist.GetByIDForViewer(ctx, id, userID)
}

func (s *WishlistService) Create(ctx context.Context, userID int64, name, description string, targetCollectionID *string, isPublic *bool) (*models.Wishlist, error) {
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

func (s *WishlistService) Update(ctx context.Context, userID int64, id, name, description string, targetCollectionID *string, isPublic *bool, coverArt *string) (*models.Wishlist, error) {
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
	coverNorm, err := validation.NormalizeCoverArtURLPointer(coverArt, "cover_art_url")
	if err != nil {
		return nil, err
	}
	return s.wishlist.UpdateFull(ctx, id, userID, n, descPtr, targetCollectionID, isPublic, coverNorm)
}

// Delete removes a wishlist owned by userID. When entries exist, either moveEntriesTo (another owned wishlist)
// or discardEntries must be true; otherwise *WishlistDeleteConflict is returned.
func (s *WishlistService) Delete(ctx context.Context, id string, userID int64, moveEntriesTo *string, discardEntries bool) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("invalid wishlist id")
	}
	if _, err := s.wishlist.GetByIDForUser(ctx, id, userID); err != nil {
		return err
	}
	n, err := s.wishlist.CountEntriesByWishlistID(ctx, id)
	if err != nil {
		return err
	}
	moveTo := trimPtrString(moveEntriesTo)
	if n > 0 {
		if moveTo == "" && !discardEntries {
			others, err := s.wishlist.ListOwnerWishlistsExcept(ctx, userID, id)
			if err != nil {
				return err
			}
			targets := make([]WishlistMoveTarget, 0, len(others))
			for _, w := range others {
				targets = append(targets, WishlistMoveTarget{ID: w.ID, Name: w.Name})
			}
			return &WishlistDeleteConflict{EntryCount: n, EligibleMoveTargets: targets}
		}
		if moveTo != "" && discardEntries {
			return fmt.Errorf("choose either move_entries_to or discard_entries, not both")
		}
		if moveTo != "" {
			if moveTo == id {
				return fmt.Errorf("move_entries_to must be a different wishlist")
			}
			if _, err := s.wishlist.GetByIDForUser(ctx, moveTo, userID); err != nil {
				if errors.Is(err, repository.ErrWishlistNotFound) {
					return fmt.Errorf("destination wishlist not found")
				}
				return err
			}
		}
	}

	tx, err := s.wishlist.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var uid int64
	err = tx.QueryRow(ctx, `SELECT user_id FROM wishlists WHERE id = $1::uuid FOR UPDATE`, id).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return repository.ErrWishlistNotFound
	}
	if err != nil {
		return fmt.Errorf("lock wishlist: %w", err)
	}
	if uid != userID {
		return repository.ErrWishlistNotFound
	}

	if n > 0 && moveTo != "" {
		first, second := id, moveTo
		if first > second {
			first, second = second, first
		}
		var sink int
		if err := tx.QueryRow(ctx, `SELECT 1 FROM wishlists WHERE id = $1::uuid FOR UPDATE`, first).Scan(&sink); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return repository.ErrWishlistNotFound
			}
			return fmt.Errorf("lock wishlist: %w", err)
		}
		if second != first {
			if err := tx.QueryRow(ctx, `SELECT 1 FROM wishlists WHERE id = $1::uuid FOR UPDATE`, second).Scan(&sink); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return repository.ErrWishlistNotFound
				}
				return fmt.Errorf("lock wishlist: %w", err)
			}
		}
		if err := s.wishlist.CopyEntriesToWishlistTx(ctx, tx, userID, id, moveTo); err != nil {
			return err
		}
	}

	if err := s.wishlist.DeleteOwnedWishlistTx(ctx, tx, id, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *WishlistService) ListEntries(ctx context.Context, wishlistID string, userID int64) ([]models.WishlistEntry, error) {
	if _, err := s.wishlist.GetByIDForViewer(ctx, wishlistID, userID); err != nil {
		return nil, err
	}
	return s.wishlist.ListEntries(ctx, wishlistID, userID)
}

func (s *WishlistService) AddEntry(ctx context.Context, wishlistID string, userID int64, title string, category models.Category, metadata json.RawMessage) (*models.WishlistEntry, error) {
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

func (s *WishlistService) DeleteEntry(ctx context.Context, wishlistID, entryID string, userID int64) error {
	if _, err := s.wishlist.GetByIDForUser(ctx, wishlistID, userID); err != nil {
		return err
	}
	return s.wishlist.DeleteEntry(ctx, wishlistID, entryID, userID)
}

// Obtain creates a collection item from the wishlist entry and removes the entry.
func (s *WishlistService) Obtain(ctx context.Context, userID int64, wishlistID, entryID string, collectionID *string) (*models.Item, error) {
	wl, err := s.wishlist.GetByIDForUser(ctx, wishlistID, userID)
	if err != nil {
		return nil, err
	}
	var cid string
	if collectionID != nil && strings.TrimSpace(*collectionID) != "" {
		cid = strings.TrimSpace(*collectionID)
	} else if wl.TargetCollectionID != nil && strings.TrimSpace(*wl.TargetCollectionID) != "" {
		cid = strings.TrimSpace(*wl.TargetCollectionID)
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

func (s *WishlistService) validateTargetCollection(ctx context.Context, userID int64, targetCollectionID *string) error {
	if targetCollectionID == nil || strings.TrimSpace(*targetCollectionID) == "" {
		return nil
	}
	cid := strings.TrimSpace(*targetCollectionID)
	_, err := s.coll.GetByID(ctx, cid, &userID)
	if err != nil {
		if errors.Is(err, repository.ErrCollectionNotFound) {
			return fmt.Errorf("collection not found or not accessible")
		}
		return err
	}
	return nil
}
