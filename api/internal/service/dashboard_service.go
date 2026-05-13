package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
)

// DashboardRecentShelvesLimit is the default page size for the dashboard recent shelves feed.
const DashboardRecentShelvesLimit = 10

// DashboardRecentShelvesMax is the upper bound the API accepts for an explicit limit.
const DashboardRecentShelvesMax = 30

type DashboardService struct {
	repo *repository.PostgresDashboardRepository
}

func NewDashboardService(repo *repository.PostgresDashboardRepository) *DashboardService {
	return &DashboardService{repo: repo}
}

// RecentShelves returns the viewer's most recently updated shelves (scope=mine) or shelves from
// users they follow (scope=following), optionally filtered by kind. limit defaults to
// DashboardRecentShelvesLimit and is capped at DashboardRecentShelvesMax.
func (s *DashboardService) RecentShelves(ctx context.Context, userID int64, scope string, kind string, limit int) ([]models.DashboardShelf, error) {
	if userID < 1 {
		return nil, fmt.Errorf("unauthorized")
	}
	ds, err := parseDashboardScope(scope)
	if err != nil {
		return nil, err
	}
	kinds, err := parseDashboardKinds(kind)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = DashboardRecentShelvesLimit
	}
	if limit > DashboardRecentShelvesMax {
		limit = DashboardRecentShelvesMax
	}
	return s.repo.ListRecentShelves(ctx, repository.RecentShelvesParams{
		ViewerUserID: userID,
		Scope:        ds,
		Kinds:        kinds,
		Limit:        limit,
	})
}

func parseDashboardScope(raw string) (repository.DashboardScope, error) {
	t := strings.ToLower(strings.TrimSpace(raw))
	switch t {
	case "", "mine":
		return repository.DashboardScopeMine, nil
	case "following":
		return repository.DashboardScopeFollowing, nil
	default:
		return "", fmt.Errorf("invalid scope")
	}
}

// parseDashboardKinds accepts an empty string (all kinds) or a single kind ("collection",
// "list", "wishlist"). Comma-separated lists are not supported on the public API to keep the
// query string simple — clients toggle filter chips, not multi-select.
func parseDashboardKinds(raw string) ([]repository.ShelfKind, error) {
	t := strings.ToLower(strings.TrimSpace(raw))
	if t == "" {
		return nil, nil
	}
	k, err := repository.ParseShelfKind(t)
	if err != nil {
		return nil, fmt.Errorf("invalid kind")
	}
	return []repository.ShelfKind{k}, nil
}
