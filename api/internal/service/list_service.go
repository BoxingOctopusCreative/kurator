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

func itemShelvedID(it *models.Item) (shelfID string, ok bool) {
	if it == nil || it.CollectionID == nil {
		return "", false
	}
	s := strings.TrimSpace(*it.CollectionID)
	if s == "" {
		return "", false
	}
	return s, true
}

// ErrListAddForbidden is returned when the item is not yours (loose) and not on a shelf you can edit.
var ErrListAddForbidden = errors.New("you can only add items you own or from shelves you can edit")

// ErrHitlistReorderForbidden is returned when the caller may not change hitlist entry order.
var ErrHitlistReorderForbidden = errors.New("you cannot reorder entries on this hitlist")

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

// ListDiscover returns non-private hitlists visible to the viewer (nil → public only) with feed sort.
func (s *ListService) ListDiscover(ctx context.Context, viewer *int64, sort string) ([]models.List, error) {
	return s.list.ListDiscoverForViewer(ctx, viewer, sort)
}

// IncrementListView bumps the list view counter (errors ignored).
func (s *ListService) IncrementListView(ctx context.Context, listID string) {
	_ = s.list.IncrementListViewCount(ctx, listID)
}

// ListByOwnerForViewer returns lists owned by ownerUserID visible to viewer (nil viewer → none).
func (s *ListService) ListByOwnerForViewer(ctx context.Context, ownerUserID int64, viewer *int64) ([]models.List, error) {
	return s.list.ListByOwnerForViewer(ctx, ownerUserID, viewer)
}

func (s *ListService) Get(ctx context.Context, id string, userID int64) (*models.List, error) {
	return s.list.GetByIDForViewer(ctx, id, userID)
}

func (s *ListService) Create(ctx context.Context, userID int64, name, description string, visibility *models.Visibility, isShared bool, slug *string, commentsEnabled *bool, entriesNumbered *bool) (*models.List, error) {
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
	if vis == models.VisibilityPublic {
		return nil, fmt.Errorf("create public lists via POST /api/v2/hitlists with a slug")
	}
	return s.list.Create(ctx, userID, n, descPtr, vis, isShared, slug, commentsEnabled, entriesNumbered)
}

func (s *ListService) Update(ctx context.Context, userID int64, id string, name, description string, visibility *models.Visibility, coverArt *string, isShared *bool, extra *repository.ListUpdateExtras) (*models.List, error) {
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
	return s.list.UpdateFull(ctx, id, userID, n, descPtr, visibility, coverNorm, isShared, extra)
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
	var mayAdd bool
	if shelfID, ok := itemShelvedID(it); ok {
		var cerr error
		mayAdd, cerr = s.coll.UserMayMutateCollectionContent(ctx, shelfID, userID)
		if cerr != nil {
			return cerr
		}
	} else {
		mayAdd = it.OwnerUserID != nil && *it.OwnerUserID == userID
	}
	if !mayAdd {
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

// GetVisible loads a list when the viewer is allowed to see it (nil viewer → public lists only).
func (s *ListService) GetVisible(ctx context.Context, id string, viewer *int64) (*models.List, error) {
	return s.list.GetByIDVisible(ctx, id, viewer)
}

// GetBySlugVisible resolves a list by permalink slug.
func (s *ListService) GetBySlugVisible(ctx context.Context, slug string, viewer *int64) (*models.List, error) {
	return s.list.GetBySlugVisible(ctx, slug, viewer)
}

// AssembleHitlistEntries loads list entry rows and hydrates item links (skipping items the viewer cannot see).
func (s *ListService) AssembleHitlistEntries(ctx context.Context, listID string, viewer *int64) ([]models.HitlistEntry, error) {
	rows, err := s.list.ListEntryRowsVisible(ctx, listID, viewer)
	if err != nil {
		return nil, err
	}
	out := make([]models.HitlistEntry, 0, len(rows))
	for _, row := range rows {
		e := models.HitlistEntry{
			ID:        row.EntryID,
			ListID:    row.ListID,
			CreatedAt: row.CreatedAt,
		}
		if row.Description != nil {
			d := *row.Description
			e.Description = &d
		}
		if row.ItemID != nil {
			it, err := s.items.GetByIDLinkedFromList(ctx, *row.ItemID, listID)
			if err != nil {
				if errors.Is(err, repository.ErrItemNotFound) {
					continue
				}
				return nil, err
			}
			e.Item = it
		} else if row.StubTitle != nil && row.StubCategory != nil {
			meta := json.RawMessage(`{}`)
			if len(row.StubMeta) > 0 {
				meta = json.RawMessage(row.StubMeta)
			}
			e.Stub = &models.HitlistStub{
				Title:    *row.StubTitle,
				Category: models.Category(*row.StubCategory),
				Metadata: meta,
			}
		}
		out = append(out, e)
	}
	return out, nil
}

// AddHitlistStubEntry adds an ad-hoc metadata entry to a list.
func (s *ListService) AddHitlistStubEntry(ctx context.Context, userID int64, listID, title string, category models.Category, metadata json.RawMessage, description *string) error {
	meta, err := validation.SanitizeItemMetadata(category, metadata)
	if err != nil {
		return err
	}
	return s.list.AddStubEntry(ctx, listID, userID, title, string(category), meta, description)
}

// RemoveHitlistEntry removes one entry from a list (owner or shared collaborator).
func (s *ListService) RemoveHitlistEntry(ctx context.Context, userID int64, listID, entryID string) error {
	return s.list.RemoveEntryByID(ctx, listID, entryID, userID)
}

// UpdateHitlistEntryDescription sets optional markdown blurb on a list entry (item link or stub).
func (s *ListService) UpdateHitlistEntryDescription(ctx context.Context, userID int64, listID, entryID, description string) error {
	may, err := s.list.UserMayMutateListContent(ctx, listID, userID)
	if err != nil {
		return err
	}
	if !may {
		return ErrHitlistReorderForbidden
	}
	norm, err := validation.CollectionDescription(description)
	if err != nil {
		return err
	}
	var stored *string
	if strings.TrimSpace(norm) != "" {
		stored = &norm
	}
	return s.list.UpdateEntryDescription(ctx, listID, entryID, userID, stored)
}

// ReorderHitlistEntries sets entry order for the list. orderedEntryIDs must contain each list entry id exactly once,
// in top-to-bottom display order.
func (s *ListService) ReorderHitlistEntries(ctx context.Context, userID int64, listID string, orderedEntryIDs []string) error {
	may, err := s.list.UserMayMutateListContent(ctx, listID, userID)
	if err != nil {
		return err
	}
	if !may {
		return ErrHitlistReorderForbidden
	}
	return s.list.ReorderEntries(ctx, listID, userID, orderedEntryIDs)
}

// UserMayMutateListContent reports whether the user may edit list membership (items / stubs).
func (s *ListService) UserMayMutateListContent(ctx context.Context, listID string, userID int64) (bool, error) {
	return s.list.UserMayMutateListContent(ctx, listID, userID)
}
