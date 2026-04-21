package service

import (
	"context"
	"encoding/json"
	"errors"
	"log"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/meilisearch/meilisearch-go"
)

type SearchIndexer interface {
	EnsureIndex(ctx context.Context) error
	UpsertItem(ctx context.Context, item models.Item) error
	RemoveItem(ctx context.Context, id string) error
	Search(ctx context.Context, q string, limit int64) (*meilisearch.SearchResponse, error)
}

type MeilisearchIndexer struct {
	client meilisearch.ServiceManager
	index  string
}

func NewMeilisearchIndexer(host, apiKey, index string) *MeilisearchIndexer {
	opts := []meilisearch.Option{}
	if apiKey != "" {
		opts = append(opts, meilisearch.WithAPIKey(apiKey))
	}
	return &MeilisearchIndexer{
		client: meilisearch.New(host, opts...),
		index:  index,
	}
}

type searchDoc struct {
	ID                 string          `json:"id"`
	Title              string          `json:"title"`
	Category           string          `json:"category"`
	Metadata           json.RawMessage `json:"metadata"`
	Rating             *int            `json:"rating,omitempty"`
	ConsumptionStatus  string          `json:"consumption_status,omitempty"`
}

// Ping checks that the Meilisearch server accepts requests (health endpoint).
func (m *MeilisearchIndexer) Ping(ctx context.Context) error {
	if m == nil {
		return errors.New("nil indexer")
	}
	_, err := m.client.HealthWithContext(ctx)
	return err
}

func (m *MeilisearchIndexer) EnsureIndex(ctx context.Context) error {
	if _, err := m.client.GetIndex(m.index); err == nil {
		_, err := m.client.Index(m.index).UpdateSearchableAttributes(&[]string{"title", "category", "metadata"})
		_ = ctx
		return err
	}
	if _, err := m.client.CreateIndex(&meilisearch.IndexConfig{
		Uid:        m.index,
		PrimaryKey: "id",
	}); err != nil {
		return err
	}
	_, err := m.client.Index(m.index).UpdateSearchableAttributes(&[]string{"title", "category", "metadata"})
	return err
}

func (m *MeilisearchIndexer) UpsertItem(ctx context.Context, item models.Item) error {
	doc := searchDoc{
		ID:                item.ID,
		Title:             item.Title,
		Category:          string(item.Category),
		Metadata:          item.Metadata,
		Rating:            item.Rating,
		ConsumptionStatus: string(item.ConsumptionStatus),
	}
	_, err := m.client.Index(m.index).AddDocuments([]searchDoc{doc}, "id")
	_ = ctx
	return err
}

func (m *MeilisearchIndexer) RemoveItem(ctx context.Context, id string) error {
	_, err := m.client.Index(m.index).DeleteDocument(id)
	_ = ctx
	return err
}

func (m *MeilisearchIndexer) Search(ctx context.Context, q string, limit int64) (*meilisearch.SearchResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	resp, err := m.client.Index(m.index).Search(q, &meilisearch.SearchRequest{Limit: limit})
	_ = ctx
	return resp, err
}

// LogIndexError is used by ItemService for non-fatal index failures.
func LogIndexError(op string, err error) {
	if err != nil {
		log.Printf("meilisearch %s: %v", op, err)
	}
}
