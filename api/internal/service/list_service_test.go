package service

import (
	"context"
	"errors"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

func TestListService_Create_publicWithoutSlug(t *testing.T) {
	svc := &ListService{}
	vis := models.VisibilityPublic
	_, err := svc.Create(context.Background(), 1, "My List", "", &vis, false, nil, nil, nil)
	if !errors.Is(err, ErrPublicHitlistRequiresSlug) {
		t.Fatalf("Create() error = %v, want ErrPublicHitlistRequiresSlug", err)
	}
}

func TestListService_Create_publicWithEmptySlug(t *testing.T) {
	svc := &ListService{}
	vis := models.VisibilityPublic
	empty := "   "
	_, err := svc.Create(context.Background(), 1, "My List", "", &vis, false, &empty, nil, nil)
	if !errors.Is(err, ErrPublicHitlistRequiresSlug) {
		t.Fatalf("Create() error = %v, want ErrPublicHitlistRequiresSlug", err)
	}
}
