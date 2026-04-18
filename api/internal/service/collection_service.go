package service

import (
	"context"
	"fmt"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

type CollectionService struct {
	repo *repository.PostgresCollectionRepository
}

func NewCollectionService(repo *repository.PostgresCollectionRepository) *CollectionService {
	return &CollectionService{repo: repo}
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

func (s *CollectionService) Get(ctx context.Context, id int64, viewer *int64) (*models.Collection, error) {
	return s.repo.GetByID(ctx, id, viewer)
}

// Create adds a collection for the signed-in user.
func (s *CollectionService) Create(ctx context.Context, userID int64, name, description string, isPublic *bool) (*models.Collection, error) {
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
	return s.repo.Create(ctx, userID, n, descPtr, pub)
}

// Patch updates a collection owned by userID.
func (s *CollectionService) Patch(ctx context.Context, userID, id int64, name *string, description *string, isPublic *bool) (*models.Collection, error) {
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
	if name == nil && description == nil && isPublic == nil {
		return nil, fmt.Errorf("no changes")
	}
	return s.repo.UpdateByOwner(ctx, userID, id, name, description, isPublic)
}
