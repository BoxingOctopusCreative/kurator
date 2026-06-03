package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

const exploreSearchMinLen = 2

var exploreSearchKindOrder = []string{
	"collection",
	"hitlist",
	"wishlist",
	"board",
	"thread",
	"reply",
	"hitlist_comment",
	"user",
}

type ExploreSearchService struct {
	explore *repository.ExploreSearchRepository
	users   repository.UserRepository
}

func NewExploreSearchService(explore *repository.ExploreSearchRepository, users repository.UserRepository) *ExploreSearchService {
	return &ExploreSearchService{explore: explore, users: users}
}

func (s *ExploreSearchService) Search(ctx context.Context, q string, viewer *int64, perKindLimit int) (*models.ExploreSearchResponse, error) {
	q2, err := validation.SearchQuery(q, "Search")
	if err != nil {
		return nil, err
	}
	q2 = strings.TrimSpace(q2)
	if len(q2) < exploreSearchMinLen {
		return nil, fmt.Errorf("search at least %d characters", exploreSearchMinLen)
	}

	collections, err := s.explore.SearchCollections(ctx, q2, viewer, perKindLimit)
	if err != nil {
		return nil, err
	}
	hitlists, err := s.explore.SearchHitlists(ctx, q2, viewer, perKindLimit)
	if err != nil {
		return nil, err
	}
	wishlists, err := s.explore.SearchWishlists(ctx, q2, viewer, perKindLimit)
	if err != nil {
		return nil, err
	}
	boards, err := s.explore.SearchBoards(ctx, q2, viewer, perKindLimit)
	if err != nil {
		return nil, err
	}
	threads, err := s.explore.SearchThreads(ctx, q2, viewer, perKindLimit)
	if err != nil {
		return nil, err
	}
	replies, err := s.explore.SearchReplies(ctx, q2, viewer, perKindLimit)
	if err != nil {
		return nil, err
	}
	comments, err := s.explore.SearchHitlistComments(ctx, q2, viewer, perKindLimit)
	if err != nil {
		return nil, err
	}
	users, err := s.searchUsers(ctx, q2, perKindLimit)
	if err != nil {
		return nil, err
	}

	byKind := map[string][]models.ExploreSearchHit{
		"collection":      collections,
		"hitlist":         hitlists,
		"wishlist":        wishlists,
		"board":           boards,
		"thread":          threads,
		"reply":           replies,
		"hitlist_comment": comments,
		"user":            users,
	}
	out := make([]models.ExploreSearchHit, 0)
	for _, kind := range exploreSearchKindOrder {
		if h := byKind[kind]; len(h) > 0 {
			out = append(out, h...)
		}
	}
	return &models.ExploreSearchResponse{Query: q2, Hits: out}, nil
}

func (s *ExploreSearchService) searchUsers(ctx context.Context, q string, limit int) ([]models.ExploreSearchHit, error) {
	pub, err := s.users.SearchPublic(ctx, q, limit, nil)
	if err != nil {
		return nil, err
	}
	out := make([]models.ExploreSearchHit, 0, len(pub))
	for _, u := range pub {
		title := u.DisplayName
		if title == "" {
			title = u.Username
		}
		sub := "@" + u.Username
		out = append(out, models.ExploreSearchHit{
			Kind:     "user",
			ID:       fmt.Sprintf("%d", u.ID),
			Title:    title,
			Subtitle: &sub,
			URL:      "/people/" + u.Username,
		})
	}
	return out, nil
}
