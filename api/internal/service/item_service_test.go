package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/jackc/pgx/v5"
)

const testCollUUID = "22222222-2222-2222-2222-222222222222"
const testItemUUID = "11111111-1111-1111-1111-111111111111"

func shelvedItem(coll string) *string { return &coll }

type stubItemRepo struct {
	list    []models.Item
	listErr error

	getItem *models.Item
	getErr  error

	lastCreateColl  string
	lastCreateLoose bool
	lastCreateTitle string
	lastCreateCat   models.Category
	createItem      *models.Item
	createErr       error

	updateItem *models.Item
	updateErr  error

	deletedIDs []string
	deleteErr  error
}

func (s *stubItemRepo) ListLatest(ctx context.Context, viewer *int64, limit int) ([]models.Item, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (s *stubItemRepo) ListByCollection(ctx context.Context, collectionID string, viewer *int64, limit int, consumptionFilter string) ([]models.Item, error) {
	if s.listErr != nil {
		return nil, s.listErr
	}
	return s.list, nil
}

func (s *stubItemRepo) ListByCollectionExport(ctx context.Context, collectionID string, max int) ([]models.Item, error) {
	return s.ListByCollection(ctx, collectionID, nil, max, "")
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

func (s *stubItemRepo) GetByID(ctx context.Context, id string, viewer *int64) (*models.Item, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.getItem, nil
}

func (s *stubItemRepo) GetByIDLinkedFromList(ctx context.Context, itemID, listID string) (*models.Item, error) {
	_ = listID
	return s.GetByID(ctx, itemID, nil)
}

func (s *stubItemRepo) Create(ctx context.Context, collectionID *string, ownerUserID *int64, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error) {
	if collectionID == nil {
		s.lastCreateLoose = true
		s.lastCreateColl = ""
	} else {
		s.lastCreateLoose = false
		s.lastCreateColl = *collectionID
	}
	s.lastCreateTitle = title
	s.lastCreateCat = category
	if s.createErr != nil {
		return nil, s.createErr
	}
	return s.createItem, nil
}

func (s *stubItemRepo) CreateTx(ctx context.Context, tx pgx.Tx, collectionID *string, ownerUserID *int64, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error) {
	_ = tx
	return s.Create(ctx, collectionID, ownerUserID, title, category, metadata, rating, consumption)
}

func (s *stubItemRepo) UpdateTx(ctx context.Context, tx pgx.Tx, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error) {
	_ = tx
	return s.Update(ctx, id, title, category, metadata, rating, consumption, newCollectionID)
}

func (s *stubItemRepo) Update(ctx context.Context, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error) {
	if s.updateErr != nil {
		return nil, s.updateErr
	}
	return s.updateItem, nil
}

func (s *stubItemRepo) Delete(ctx context.Context, id string) error {
	s.deletedIDs = append(s.deletedIDs, id)
	return s.deleteErr
}

func TestItemService_Create_validation(t *testing.T) {
	ctx := context.Background()
	repo := &stubItemRepo{}
	svc := NewItemService(repo, nil, nil)

	_, err := svc.Create(ctx, CreateItemInput{
		Loose:        false,
		CollectionID: testCollUUID,
		Title:        "",
		Category:     models.CategoryGame,
		Metadata:     json.RawMessage(`{}`),
	})
	if err == nil || err.Error() != "Title is required" {
		t.Fatalf("Create empty title: got err %v", err)
	}

	_, err = svc.Create(ctx, CreateItemInput{
		Loose:        false,
		CollectionID: testCollUUID,
		Title:        "Ok",
		Category:     "nope",
		Metadata:     json.RawMessage(`{}`),
	})
	if err == nil || err.Error() != "invalid category" {
		t.Fatalf("Create bad category: got err %v", err)
	}

	_, err = svc.Create(ctx, CreateItemInput{
		Loose:        false,
		CollectionID: "",
		Title:        "Ok",
		Category:     models.CategoryGame,
		Metadata:     json.RawMessage(`{}`),
	})
	if err == nil || err.Error() != "collection_id is required" {
		t.Fatalf("Create missing collection: got err %v", err)
	}
}

func TestItemService_Create_passesCollectionID(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()
	coll := testCollUUID
	want := &models.Item{
		ID:           testItemUUID,
		CollectionID: &coll,
		Title:        "Chrono Trigger",
		Category:     models.CategoryGame,
		Metadata:     json.RawMessage(`{}`),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	repo := &stubItemRepo{createItem: want}
	svc := NewItemService(repo, nil, nil)

	got, err := svc.Create(ctx, CreateItemInput{
		Loose:        false,
		CollectionID: testCollUUID,
		Title:        "Chrono Trigger",
		Category:     models.CategoryGame,
		Metadata:     json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != want.ID {
		t.Fatalf("item id: got %q", got.ID)
	}
	if repo.lastCreateLoose {
		t.Fatal("expected shelved create")
	}
	if repo.lastCreateColl != testCollUUID {
		t.Fatalf("expected collection %q, got %q", testCollUUID, repo.lastCreateColl)
	}
	if repo.lastCreateTitle != "Chrono Trigger" {
		t.Fatalf("title: got %q", repo.lastCreateTitle)
	}
}

func TestItemService_Update_validation(t *testing.T) {
	ctx := context.Background()
	repo := &stubItemRepo{
		getItem: &models.Item{
			ID:           testItemUUID,
			CollectionID: shelvedItem(testCollUUID),
			Title:        "x",
			Category:     models.CategoryBook,
			Metadata:     json.RawMessage(`{}`),
		},
	}
	svc := NewItemService(repo, nil, nil)

	_, err := svc.Update(ctx, testItemUUID, UpdateItemInput{
		Title:    "",
		Category: models.CategoryBook,
		Metadata: json.RawMessage(`{}`),
	})
	if err == nil || err.Error() != "Title is required" {
		t.Fatalf("Update empty title: got %v", err)
	}

	_, err = svc.Update(ctx, testItemUUID, UpdateItemInput{
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
	svc := NewItemService(repo, nil, nil)

	_, err := svc.Get(ctx, "99999999-9999-9999-9999-999999999999", nil)
	if err != repository.ErrItemNotFound {
		t.Fatalf("got %v want ErrItemNotFound", err)
	}
}

func TestItemService_Delete_propagatesNotFound(t *testing.T) {
	ctx := context.Background()
	repo := &stubItemRepo{deleteErr: repository.ErrItemNotFound}
	svc := NewItemService(repo, nil, nil)

	err := svc.Delete(ctx, "55555555-5555-5555-5555-555555555555")
	if err != repository.ErrItemNotFound {
		t.Fatalf("got %v", err)
	}
}
