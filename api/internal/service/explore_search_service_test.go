package service

import (
	"context"
	"testing"
)

func TestExploreSearchService_Search_minLength(t *testing.T) {
	svc := NewExploreSearchService(nil, nil)
	_, err := svc.Search(context.Background(), "a", nil, 5)
	if err == nil {
		t.Fatal("expected error for short query")
	}
}
