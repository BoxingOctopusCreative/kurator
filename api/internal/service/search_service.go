package service

import (
	"context"

	"github.com/boxingoctopus/kurator/api/internal/validation"
)

type SearchService struct {
	indexer SearchIndexer
}

func NewSearchService(indexer SearchIndexer) *SearchService {
	return &SearchService{indexer: indexer}
}

func (s *SearchService) Search(ctx context.Context, q string, limit int64) (any, error) {
	q2, err := validation.SearchQuery(q, "Search")
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if s.indexer == nil {
		return map[string]any{"hits": []any{}, "query": q2}, nil
	}
	return s.indexer.Search(ctx, q2, limit)
}
