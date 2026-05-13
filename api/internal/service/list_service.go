package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/jackc/pgx/v5"
)

// ErrListAddForbidden is returned when the item lives in a collection the list owner cannot edit.
var ErrListAddForbidden = errors.New("you can only add items from shelves you can edit")

type ListService struct {
	list  *repository.PostgresListRepository
	coll  *repository.PostgresCollectionRepository
	items repository.ItemRepository
}

func NewListService(
	list *repository.PostgresListRepository,
	coll *repository.PostgresCollectionRepository,
	items repository.ItemRepository,
) *ListService {
	return &ListService{list: list, coll: coll, items: items}
}

func (s *ListService) List(ctx context.Context, userID int64) ([]models.List, error) {
	return s.list.ListForViewer(ctx, userID)
}

// ListByOwnerForViewer returns lists owned by ownerUserID visible to viewer (nil viewer → none).
func (s *ListService) ListByOwnerForViewer(ctx context.Context, ownerUserID int64, viewer *int64) ([]models.List, error) {
	return s.list.ListByOwnerForViewer(ctx, ownerUserID, viewer)
}

func (s *ListService) Get(ctx context.Context, id string, userID int64) (*models.List, error) {
	return s.list.GetByIDForViewer(ctx, id, userID)
}

func (s *ListService) Create(ctx context.Context, userID int64, name, description string, visibility *models.Visibility, isShared bool) (*models.List, error) {
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
	vis := models.DefaultVisibility
	if visibility != nil && (*visibility).Valid() {
		vis = *visibility
	}
	return s.list.Create(ctx, userID, n, descPtr, vis, isShared)
}

func (s *ListService) Update(ctx context.Context, userID int64, id string, name, description string, visibility *models.Visibility, coverArt *string, isShared *bool) (*models.List, error) {
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
	return s.list.UpdateFull(ctx, id, userID, n, descPtr, visibility, coverNorm, isShared)
}

func trimPtrString(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

// Delete removes a list owned by userID. When the list still has item links, either moveEntriesTo
// (another owned list) or discardEntries must be true; otherwise *ListDeleteConflict is returned.
// Discarding only removes list links — items on shelves are not deleted.
func (s *ListService) Delete(ctx context.Context, userID int64, listID string, moveEntriesTo *string, discardEntries bool) error {
	listID = strings.TrimSpace(listID)
	if listID == "" {
		return fmt.Errorf("invalid list id")
	}
	if _, err := s.list.GetByIDForUser(ctx, listID, userID); err != nil {
		return err
	}
	n, err := s.list.CountEntriesByListID(ctx, listID)
	if err != nil {
		return err
	}
	moveTo := trimPtrString(moveEntriesTo)
	if n > 0 {
		if moveTo == "" && !discardEntries {
			others, err := s.list.ListOwnerListsExcept(ctx, userID, listID)
			if err != nil {
				return err
			}
			targets := make([]ListMoveTarget, 0, len(others))
			for _, l := range others {
				targets = append(targets, ListMoveTarget{ID: l.ID, Name: l.Name})
			}
			return &ListDeleteConflict{EntryCount: n, EligibleMoveTargets: targets}
		}
		if moveTo != "" && discardEntries {
			return fmt.Errorf("choose either move_entries_to or discard_entries, not both")
		}
		if moveTo != "" {
			if moveTo == listID {
				return fmt.Errorf("move_entries_to must be a different list")
			}
			if _, err := s.list.GetByIDForUser(ctx, moveTo, userID); err != nil {
				if errors.Is(err, repository.ErrListNotFound) {
					return fmt.Errorf("destination list not found")
				}
				return err
			}
		}
	}

	tx, err := s.list.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var uid int64
	err = tx.QueryRow(ctx, `SELECT user_id FROM lists WHERE id = $1::uuid FOR UPDATE`, listID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return repository.ErrListNotFound
	}
	if err != nil {
		return fmt.Errorf("lock list: %w", err)
	}
	if uid != userID {
		return repository.ErrListNotFound
	}

	if n > 0 && moveTo != "" {
		first, second := listID, moveTo
		if first > second {
			first, second = second, first
		}
		var sink int
		if err := tx.QueryRow(ctx, `SELECT 1 FROM lists WHERE id = $1::uuid FOR UPDATE`, first).Scan(&sink); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return repository.ErrListNotFound
			}
			return fmt.Errorf("lock list: %w", err)
		}
		if second != first {
			if err := tx.QueryRow(ctx, `SELECT 1 FROM lists WHERE id = $1::uuid FOR UPDATE`, second).Scan(&sink); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return repository.ErrListNotFound
				}
				return fmt.Errorf("lock list: %w", err)
			}
		}
		if err := s.list.MoveEntriesToListTx(ctx, tx, userID, listID, moveTo); err != nil {
			return err
		}
	}

	if err := s.list.DeleteOwnedListTx(ctx, tx, listID, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *ListService) ListItems(ctx context.Context, listID string, userID int64) ([]models.Item, error) {
	return s.list.ListItemsForViewer(ctx, listID, userID)
}

func (s *ListService) AddItem(ctx context.Context, userID int64, listID, itemID string) error {
	itemID = strings.TrimSpace(itemID)
	if itemID == "" {
		return fmt.Errorf("item_id is required")
	}
	it, err := s.items.GetByID(ctx, itemID, &userID)
	if err != nil {
		return err
	}
	ok, err := s.coll.UserMayMutateCollectionContent(ctx, it.CollectionID, userID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrListAddForbidden
	}
	err = s.list.AddItem(ctx, listID, itemID, userID)
	if errors.Is(err, repository.ErrListDuplicateEntry) {
		return err
	}
	return err
}

func (s *ListService) RemoveItem(ctx context.Context, userID int64, listID, itemID string) error {
	return s.list.RemoveItem(ctx, listID, itemID, userID)
}

// ListRefsContainingItemForViewer returns lists visible to the viewer that contain this item.
func (s *ListService) ListRefsContainingItemForViewer(ctx context.Context, itemID string, viewerID *int64) ([]models.ListRef, error) {
	return s.list.ListRefsContainingItemForViewer(ctx, itemID, viewerID)
}
