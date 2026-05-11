package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const (
	testCollID = "22222222-2222-2222-2222-222222222222"
	testItemID = "11111111-1111-1111-1111-111111111111"
	testItem2  = "77777777-7777-7777-7777-777777777777"
)

func newItemTestApp(t *testing.T, repo *handlerStubItemRepo) *fiber.App {
	t.Helper()
	svc := service.NewItemService(repo, nil, nil)
	h := NewItemHandler(svc, nil, nil, nil, nil, nil)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", int64(1))
		return c.Next()
	})
	app.Get("/items", h.List)
	app.Get("/items/:id", h.Get)
	app.Post("/items", h.Create)
	app.Put("/items/:id", h.Update)
	app.Delete("/items/:id", h.Delete)
	return app
}

type handlerStubItemRepo struct {
	list    []models.Item
	getItem *models.Item
	getErr  error

	lastCreateColl string
	createItem     *models.Item
	createErr      error

	updateItem *models.Item
	updateErr  error

	deleteErr error
}

func (s *handlerStubItemRepo) ListLatest(ctx context.Context, viewer *int64, limit int) ([]models.Item, error) {
	return s.list, nil
}

func (s *handlerStubItemRepo) ListByCollection(ctx context.Context, collectionID string, viewer *int64, limit int, consumptionFilter string) ([]models.Item, error) {
	return s.list, nil
}

func (s *handlerStubItemRepo) ListByCollectionExport(ctx context.Context, collectionID string, max int) ([]models.Item, error) {
	return s.list, nil
}

func (s *handlerStubItemRepo) ListRecentForOwner(ctx context.Context, ownerUserID int64, limit int) ([]models.Item, error) {
	return s.list, nil
}

func (s *handlerStubItemRepo) ListRecentFromFollowedUsers(ctx context.Context, followerUserID int64, limit int) ([]models.Item, error) {
	return s.list, nil
}

func (s *handlerStubItemRepo) GetByID(ctx context.Context, id string, viewer *int64) (*models.Item, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.getItem, nil
}

func (s *handlerStubItemRepo) Create(ctx context.Context, collectionID string, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error) {
	s.lastCreateColl = collectionID
	if s.createErr != nil {
		return nil, s.createErr
	}
	return s.createItem, nil
}

func (s *handlerStubItemRepo) CreateTx(ctx context.Context, tx pgx.Tx, collectionID string, title string, category models.Category, metadata json.RawMessage, rating *int, consumption *models.ConsumptionStatus) (*models.Item, error) {
	_ = tx
	return s.Create(ctx, collectionID, title, category, metadata, rating, consumption)
}

func (s *handlerStubItemRepo) Update(ctx context.Context, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error) {
	if s.updateErr != nil {
		return nil, s.updateErr
	}
	return s.updateItem, nil
}

func (s *handlerStubItemRepo) UpdateTx(ctx context.Context, tx pgx.Tx, id string, title string, category models.Category, metadata json.RawMessage, rating *models.RatingUpdate, consumption *models.ConsumptionStatus, newCollectionID *string) (*models.Item, error) {
	_ = tx
	return s.Update(ctx, id, title, category, metadata, rating, consumption, newCollectionID)
}

func (s *handlerStubItemRepo) Delete(ctx context.Context, id string) error {
	return s.deleteErr
}

func TestItemHandler_Get_invalidID(t *testing.T) {
	app := newItemTestApp(t, &handlerStubItemRepo{})
	for _, path := range []string{"/items/0", "/items/-1", "/items/abc", "/items/not-a-uuid"} {
		req := httptest.NewRequest("GET", path, nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != 400 {
			t.Fatalf("%s: status %d want 400", path, resp.StatusCode)
		}
		_ = resp.Body.Close()
	}
}

func TestItemHandler_Get_notFound(t *testing.T) {
	repo := &handlerStubItemRepo{getErr: repository.ErrItemNotFound}
	app := newItemTestApp(t, repo)
	req := httptest.NewRequest("GET", "/items/99999999-9999-9999-9999-999999999999", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 404 {
		t.Fatalf("status %d want 404", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestItemHandler_Get_ok(t *testing.T) {
	now := time.Now().UTC()
	item := &models.Item{
		ID:           testItemID,
		CollectionID: testCollID,
		Title:        "Test",
		Category:     models.CategoryMusic,
		Metadata:     json.RawMessage(`{"a":1}`),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	app := newItemTestApp(t, &handlerStubItemRepo{getItem: item})
	req := httptest.NewRequest("GET", "/items/"+testItemID, nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	var got models.Item
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if got.Title != "Test" || got.Category != models.CategoryMusic {
		t.Fatalf("decode: %+v", got)
	}
}

func TestItemHandler_Create_invalidJSON(t *testing.T) {
	app := newItemTestApp(t, &handlerStubItemRepo{})
	req := httptest.NewRequest("POST", "/items", bytes.NewBufferString("not-json"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 400 {
		t.Fatalf("status %d want 400", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestItemHandler_Create_invalidCategory(t *testing.T) {
	app := newItemTestApp(t, &handlerStubItemRepo{})
	body := map[string]any{
		"title": "x", "category": "invalid", "metadata": map[string]any{},
		"collection_id": testCollID,
	}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/items", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 400 {
		t.Fatalf("status %d want 400", resp.StatusCode)
	}
	_ = resp.Body.Close()
}

func TestItemHandler_Create_created(t *testing.T) {
	now := time.Now().UTC()
	created := &models.Item{
		ID:           testItem2,
		CollectionID: testCollID,
		Title:        "New",
		Category:     models.CategoryBook,
		Metadata:     json.RawMessage(`{}`),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	repo := &handlerStubItemRepo{createItem: created}
	app := newItemTestApp(t, repo)
	payload := map[string]any{
		"title": "New", "category": "book", "metadata": map[string]any{},
		"collection_id": testCollID,
	}
	raw, _ := json.Marshal(payload)
	req := httptest.NewRequest("POST", "/items", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 201 {
		t.Fatalf("status %d want 201", resp.StatusCode)
	}
	if repo.lastCreateColl != testCollID {
		t.Fatalf("collection: got %q", repo.lastCreateColl)
	}
	_ = resp.Body.Close()
}

func TestItemHandler_List(t *testing.T) {
	now := time.Now().UTC()
	repo := &handlerStubItemRepo{
		list: []models.Item{
			{ID: testItemID, CollectionID: testCollID, Title: "A", Category: models.CategoryGame, Metadata: json.RawMessage(`{}`), CreatedAt: now, UpdatedAt: now},
		},
	}
	app := newItemTestApp(t, repo)
	req := httptest.NewRequest("GET", "/items?limit=5", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	b, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	var arr []models.Item
	if err := json.Unmarshal(b, &arr); err != nil {
		t.Fatal(err)
	}
	if len(arr) != 1 || arr[0].Title != "A" {
		t.Fatalf("body: %s", string(b))
	}
}

func TestItemHandler_Delete_noContent(t *testing.T) {
	now := time.Now().UTC()
	repo := &handlerStubItemRepo{
		getItem: &models.Item{
			ID:           testItemID,
			CollectionID: testCollID,
			Title:        "X",
			Category:     models.CategoryGame,
			Metadata:     json.RawMessage(`{}`),
			CreatedAt:    now,
			UpdatedAt:    now,
		},
	}
	app := newItemTestApp(t, repo)
	req := httptest.NewRequest("DELETE", "/items/"+testItemID, nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 204 {
		t.Fatalf("status %d want 204", resp.StatusCode)
	}
	_ = resp.Body.Close()
}
