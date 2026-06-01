package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// IconifyValidator checks icon collection identifiers.
type IconifyValidator interface {
	IsValidCollection(name string) bool
}

type IconifyCollectionsCache struct {
	mu         sync.RWMutex
	collections map[string]struct{}
	loadedAt   time.Time
	ttl        time.Duration
	httpClient *http.Client
}

func NewIconifyCollectionsCache() *IconifyCollectionsCache {
	return &IconifyCollectionsCache{
		collections: make(map[string]struct{}),
		ttl:         24 * time.Hour,
		httpClient:  &http.Client{Timeout: 20 * time.Second},
	}
}

func (c *IconifyCollectionsCache) IsValidCollection(name string) bool {
	name = strings.TrimSpace(name)
	if name == "" {
		return false
	}
	c.ensureLoaded()
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.collections[strings.ToLower(name)]
	return ok
}

func (c *IconifyCollectionsCache) ensureLoaded() {
	c.mu.RLock()
	stale := len(c.collections) == 0 || time.Since(c.loadedAt) > c.ttl
	c.mu.RUnlock()
	if !stale {
		return
	}
	_ = c.Refresh(context.Background())
}

func (c *IconifyCollectionsCache) Refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.iconify.design/collections", nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.seedFallback()
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		c.seedFallback()
		return fmt.Errorf("iconify collections: HTTP %d", resp.StatusCode)
	}
	var payload map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		c.seedFallback()
		return err
	}
	next := make(map[string]struct{}, len(payload))
	for key := range payload {
		next[strings.ToLower(strings.TrimSpace(key))] = struct{}{}
	}
	if len(next) == 0 {
		c.seedFallback()
		return fmt.Errorf("iconify returned no collections")
	}
	c.mu.Lock()
	c.collections = next
	c.loadedAt = time.Now()
	c.mu.Unlock()
	return nil
}

func (c *IconifyCollectionsCache) seedFallback() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.collections) > 0 {
		return
	}
	for _, set := range []string{"lucide", "mdi", "fa", "fa6-solid", "heroicons", "tabler", "ph"} {
		c.collections[set] = struct{}{}
	}
	c.loadedAt = time.Now()
}
