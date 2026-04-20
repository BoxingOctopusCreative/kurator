package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
)

type stubItemRepo struct {
	list    []models.Item
	listErr error

	getItem *models.Item
	getErr  error

	lastCreateColl  int64
	lastCreateTitle string
	lastCreateCat   models.Category
	createItem      *models.Item
	createErr       error

	updateItem *models.Item
	updateErr  error

	deletedIDs []int64
	deleteErr  error
}

func (s *stubItemRepo) ListLatest(ctx context.Context, limit int) ([]models.Item, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (s *stubItemRepo) ListByCollection(ctx context.Context, collectionID int64, limit int) ([]models.Item, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (s *stubItemRepo) ListByCollectionExport(ctx context.Context, collectionID int64, max int) ([]models.Item, error) {
	return s.ListByCollection(ctx, collectionID, max)
}

func (s *stubItemRepo) ListRecentForOwner(ctx context.Context, ownerUserID int64, limit int) ([]models.Item, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (s *stubItemRepo) ListRecentFromFollowedUsers(ctx context.Context, followerUserID int64, limit int) ([]models.Item, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (s *stubItemRepo) GetByID(ctx context.Context, id int64) (*models.Item, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.getItem, nil
}

func (s *stubItemRepo) Create(ctx context.Context, collectionID int64, title string, category models.Category, metadata json.RawMessage, rating *int) (*models.Item, error) {
	s.lastCreateColl = collectionID
	s.lastCreateTitle = title
	s.lastCreateCat = category
	if s.createErr != nil {
		return nil, s.createErr
	}
	return s.createItem, nil
}

func (s *stubItemRepo) Update(ctx context.Context, id int64, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, newCollectionID *int64) (*models.Item, error) {
	if s.updateErr != nil {
		return nil, s.updateErr
	}
	return s.updateItem, nil
}

func (s *stubItemRepo) Delete(ctx context.Context, id int64) error {
	s.deletedIDs = append(s.deletedIDs, id)
	return s.deleteErr
}

func TestItemService_Create_validation(t *testing.T) {
	ctx := context.Background()
	repo := &stubItemRepo{}
	svc := NewItemService(repo, nil)

	_, err := svc.Create(ctx, CreateItemInput{
		Title:    "",
		Category: models.CategoryGame,
		Metadata: json.RawMessage(`{}`),
	})
	if err == nil || err.Error() != "Title is required" {
		t.Fatalf("Create empty title: got err %v", err)
	}

	_, err = svc.Create(ctx, CreateItemInput{
		Title:    "Ok",
		Category: "nope",
		Metadata: json.RawMessage(`{}`),
	})
	if err == nil || err.Error() != "invalid category" {
		t.Fatalf("Create bad category: got err %v", err)
	}
}

func TestItemService_Create_defaultCollection(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()
	want := &models.Item{
		ID:           42,
		CollectionID: 1,
		Title:        "Chrono Trigger",
		Category:     models.CategoryGame,
		Metadata:     json.RawMessage(`{}`),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	repo := &stubItemRepo{createItem: want}
	svc := NewItemService(repo, nil)

	got, err := svc.Create(ctx, CreateItemInput{
		CollectionID: 0,
		Title:        "Chrono Trigger",
		Category:     models.CategoryGame,
		Metadata:     json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != want.ID {
		t.Fatalf("item id: got %d", got.ID)
	}
	if repo.lastCreateColl != 1 {
		t.Fatalf("expected collection 1, got %d", repo.lastCreateColl)
	}
	if repo.lastCreateTitle != "Chrono Trigger" {
		t.Fatalf("title: got %q", repo.lastCreateTitle)
	}
}

func TestItemService_Update_validation(t *testing.T) {
	ctx := context.Background()
	svc := NewItemService(&stubItemRepo{}, nil)

	_, err := svc.Update(ctx, 1, UpdateItemInput{
		Title:    "",
		Category: models.CategoryBook,
		Metadata: json.RawMessage(`{}`),
	})
	if err == nil || err.Error() != "Title is required" {
		t.Fatalf("Update empty title: got %v", err)
	}

	_, err = svc.Update(ctx, 1, UpdateItemInput{
		Title:    "x",
		Category: "bad",
		Metadata: json.RawMessage(`{}`),
	})
	if err == nil || err.Error() != "invalid category" {
		t.Fatalf("Update bad category: got %v", err)
	}
}

func TestItemService_Get_notFound(t *testing.T) {
	ctx := context.Background()
	repo := &stubItemRepo{getErr: repository.ErrItemNotFound}
	svc := NewItemService(repo, nil)

	_, err := svc.Get(ctx, 99)
	if err != repository.ErrItemNotFound {
		t.Fatalf("got %v want ErrItemNotFound", err)
	}
}

func TestItemService_Delete_propagatesNotFound(t *testing.T) {
	ctx := context.Background()
	repo := &stubItemRepo{deleteErr: repository.ErrItemNotFound}
	svc := NewItemService(repo, nil)

	err := svc.Delete(ctx, 5)
	if err != repository.ErrItemNotFound {
		t.Fatalf("got %v", err)
	}
}
