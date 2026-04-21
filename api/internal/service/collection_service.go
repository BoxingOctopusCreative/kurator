package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/jackc/pgx/v5"
)

type CollectionService struct {
	repo     *repository.PostgresCollectionRepository
	items    *repository.PostgresItemRepository
	search   SearchIndexer
}

func NewCollectionService(
	repo *repository.PostgresCollectionRepository,
	items *repository.PostgresItemRepository,
	search SearchIndexer,
) *CollectionService {
	return &CollectionService{repo: repo, items: items, search: search}
}

func distinctCategoriesFitShelf(cats []models.Category, shelf *models.Category) bool {
	if shelf == nil {
		return true
	}
	if len(cats) == 0 {
		return true
	}
	if len(cats) != 1 {
		return false
	}
	return cats[0] == *shelf
}

func categoryStringPtr(c *models.Category) *string {
	if c == nil {
		return nil
	}
	s := string(*c)
	return &s
}

func (s *CollectionService) buildEligibleMoveTargets(
	ctx context.Context,
	ownerID int64,
	sourceCollectionID string,
	sourceDistinct []models.Category,
) ([]CollectionMoveTarget, error) {
	others, err := s.repo.ListOwnerCollectionsExcept(ctx, ownerID, sourceCollectionID)
	if err != nil {
		return nil, err
	}
	out := make([]CollectionMoveTarget, 0)
	for _, c := range others {
		if distinctCategoriesFitShelf(sourceDistinct, c.Category) {
			out = append(out, CollectionMoveTarget{
				ID:       c.ID,
				Name:     c.Name,
				Category: categoryStringPtr(c.Category),
			})
		}
	}
	return out, nil
}

// Delete removes a collection owned by ownerID. When the shelf still has items, either moveItemsTo
// (another owned shelf that accepts every item category) or deleteItems must be set; otherwise a
// *CollectionDeleteConflict is returned.
func (s *CollectionService) Delete(ctx context.Context, ownerID int64, collectionID string, moveItemsTo *string, deleteItems bool) error {
	collectionID = strings.TrimSpace(collectionID)
	if collectionID == "" {
		return fmt.Errorf("invalid collection id")
	}
	owned, err := s.repo.IsUserOwnedCollection(ctx, collectionID, ownerID)
	if err != nil {
		return err
	}
	if !owned {
		return repository.ErrCollectionNotFound
	}

	n, err := s.items.CountByCollectionID(ctx, collectionID)
	if err != nil {
		return err
	}
	distinct, err := s.items.DistinctCategoriesByCollectionID(ctx, collectionID)
	if err != nil {
		return err
	}

	moveTo := strings.TrimSpace(stringFromPtr(moveItemsTo))
	if n > 0 {
		if moveTo == "" && !deleteItems {
			targets, terr := s.buildEligibleMoveTargets(ctx, ownerID, collectionID, distinct)
			if terr != nil {
				return terr
			}
			return &CollectionDeleteConflict{ItemCount: n, EligibleMoveTargets: targets}
		}
		if moveTo != "" && deleteItems {
			return fmt.Errorf("choose either move_items_to or delete_items, not both")
		}
		if moveTo != "" {
			if moveTo == collectionID {
				return fmt.Errorf("move_items_to must be a different collection")
			}
			tOwned, err := s.repo.IsUserOwnedCollection(ctx, moveTo, ownerID)
			if err != nil {
				return err
			}
			if !tOwned {
				return fmt.Errorf("destination collection not found")
			}
			viewer := ownerID
			tcol, err := s.repo.GetByID(ctx, moveTo, &viewer)
			if err != nil {
				if errors.Is(err, repository.ErrCollectionNotFound) {
					return fmt.Errorf("destination collection not found")
				}
				return err
			}
			if !distinctCategoriesFitShelf(distinct, tcol.Category) {
				return fmt.Errorf("items cannot be moved to the selected shelf (category mismatch)")
			}
		}
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var uid sql.NullInt64
	err = tx.QueryRow(ctx, `SELECT user_id FROM collections WHERE id = $1::uuid FOR UPDATE`, collectionID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return repository.ErrCollectionNotFound
	}
	if err != nil {
		return fmt.Errorf("lock collection: %w", err)
	}
	if !uid.Valid || uid.Int64 != ownerID {
		return repository.ErrCollectionNotFound
	}

	var movedIDs []string
	var deletedIDs []string

	if n > 0 {
		if moveTo != "" {
			first, second := collectionID, moveTo
			if first > second {
				first, second = second, first
			}
			var sink int
			if err := tx.QueryRow(ctx, `SELECT 1 FROM collections WHERE id = $1::uuid FOR UPDATE`, first).Scan(&sink); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return repository.ErrCollectionNotFound
				}
				return fmt.Errorf("lock collection: %w", err)
			}
			if second != first {
				if err := tx.QueryRow(ctx, `SELECT 1 FROM collections WHERE id = $1::uuid FOR UPDATE`, second).Scan(&sink); err != nil {
					if errors.Is(err, pgx.ErrNoRows) {
						return repository.ErrCollectionNotFound
					}
					return fmt.Errorf("lock collection: %w", err)
				}
			}
			lockedT, err := repository.TxLockCollectionCategory(ctx, tx, moveTo)
			if err != nil {
				return err
			}
			d2, err := distinctCategoriesInCollectionTx(ctx, tx, collectionID)
			if err != nil {
				return err
			}
			for _, cat := range d2 {
				if err := repository.TxAssertCollectionAcceptsItemCategory(lockedT, cat); err != nil {
					return fmt.Errorf("items cannot be moved to the selected shelf (category mismatch)")
				}
			}
			movedIDs, err = s.items.MoveAllItemsToCollectionTx(ctx, tx, collectionID, moveTo)
			if err != nil {
				return err
			}
			if err := promoteCollectionCategoryAfterBulkMove(ctx, tx, moveTo); err != nil {
				return err
			}
		} else if deleteItems {
			deletedIDs, err = s.items.DeleteAllItemsInCollectionTx(ctx, tx, collectionID)
			if err != nil {
				return err
			}
		}
	}

	if err := s.repo.DeleteOwnedCollectionTx(ctx, tx, ownerID, collectionID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	if s.search != nil {
		for _, id := range deletedIDs {
			LogIndexError("remove after collection delete", s.search.RemoveItem(ctx, id))
		}
		if len(movedIDs) > 0 {
			items, lerr := s.items.ListByIDs(ctx, movedIDs)
			if lerr != nil {
				log.Printf("meilisearch: list moved items after collection delete: %v", lerr)
			} else {
				for _, it := range items {
					LogIndexError("upsert after collection move", s.search.UpsertItem(ctx, it))
				}
			}
		}
	}

	return nil
}

func stringFromPtr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func distinctCategoriesInCollectionTx(ctx context.Context, tx pgx.Tx, collectionID string) ([]models.Category, error) {
	rows, err := tx.Query(ctx, `
		SELECT DISTINCT category FROM items WHERE collection_id = $1::uuid ORDER BY category
	`, collectionID)
	if err != nil {
		return nil, fmt.Errorf("distinct categories: %w", err)
	}
	defer rows.Close()
	var out []models.Category
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		c := models.Category(strings.TrimSpace(s))
		if c.Valid() {
			out = append(out, c)
		}
	}
	return out, rows.Err()
}

// Pins destination shelf to the sole item category when it was flex and all moved items share one category.
func promoteCollectionCategoryAfterBulkMove(ctx context.Context, tx pgx.Tx, collectionID string) error {
	var ndist int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(DISTINCT category)::int FROM items WHERE collection_id = $1::uuid
	`, collectionID).Scan(&ndist); err != nil {
		return fmt.Errorf("count distinct categories: %w", err)
	}
	if ndist != 1 {
		return nil
	}
	var cat string
	if err := tx.QueryRow(ctx, `SELECT MIN(category::text) FROM items WHERE collection_id = $1::uuid`, collectionID).Scan(&cat); err != nil {
		return fmt.Errorf("read dominant category: %w", err)
	}
	_, err := tx.Exec(ctx, `
		UPDATE collections SET category = $1, updated_at = NOW()
		WHERE id = $2::uuid AND category IS NULL
	`, cat, collectionID)
	if err != nil {
		return fmt.Errorf("pin collection category: %w", err)
	}
	return nil
}

type CollectionListResult struct {
	Items    []models.Collection `json:"items"`
	Total    int64               `json:"total"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"page_size"`
}

func (s *CollectionService) List(ctx context.Context, viewerUserID *int64, q, sort, hasDesc, scope string, ownerUserID *int64, page, limit int) (*CollectionListResult, error) {
	q2, err := validation.SearchQuery(q, "Search")
	if err != nil {
		return nil, err
	}
	sort2, err := validation.CollectionSort(sort)
	if err != nil {
		return nil, err
	}
	hasDesc2, err := validation.CollectionHasDesc(hasDesc)
	if err != nil {
		return nil, err
	}
	scope2, err := validation.CollectionListScope(scope)
	if err != nil {
		return nil, err
	}
	followingOnly := scope2 == "following"
	if followingOnly && viewerUserID == nil {
		return nil, fmt.Errorf("sign in to view collections from people you follow")
	}
	if followingOnly && ownerUserID != nil {
		return nil, fmt.Errorf("cannot combine scope=following with owner filter")
	}
	if page < 1 {
		page = 1
	}
	if limit <= 0 || limit > 48 {
		limit = 12
	}
	offset := (page - 1) * limit
	items, total, err := s.repo.List(ctx, repository.CollectionListParams{
		ViewerUserID:  viewerUserID,
		FollowingOnly: followingOnly,
		OwnerUserID:   ownerUserID,
		Q:             q2,
		Sort:          sort2,
		HasDesc:       hasDesc2,
		Limit:         limit,
		Offset:        offset,
	})
	if err != nil {
		return nil, err
	}
	return &CollectionListResult{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: limit,
	}, nil
}

func (s *CollectionService) Get(ctx context.Context, id string, viewer *int64) (*models.Collection, error) {
	return s.repo.GetByID(ctx, id, viewer)
}

// Create adds a collection for the signed-in user. shelfCategory pins the shelf to one item type when set (omit for a flex shelf until the first item pins it).
func (s *CollectionService) Create(ctx context.Context, userID int64, name, description string, isPublic *bool, shelfCategory *models.Category) (*models.Collection, error) {
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
	if shelfCategory != nil {
		if !shelfCategory.Valid() {
			return nil, fmt.Errorf("invalid category")
		}
	}
	return s.repo.Create(ctx, userID, n, descPtr, pub, shelfCategory)
}

// Patch updates a collection owned by userID.
func (s *CollectionService) Patch(ctx context.Context, userID int64, id string, name *string, description *string, isPublic *bool, coverArt *string) (*models.Collection, error) {
	if name != nil {
		n, err := validation.CollectionOrWishlistName(*name, "Name")
		if err != nil {
			return nil, err
		}
		name = &n
	}
	if description != nil {
		d, err := validation.CollectionDescription(*description)
		if err != nil {
			return nil, err
		}
		description = &d
	}
	coverNorm, err := validation.NormalizeCoverArtURLPointer(coverArt, "cover_art_url")
	if err != nil {
		return nil, err
	}
	if name == nil && description == nil && isPublic == nil && coverNorm == nil {
		return nil, fmt.Errorf("no changes")
	}
	return s.repo.UpdateByOwner(ctx, userID, id, name, description, isPublic, coverNorm)
}
