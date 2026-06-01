package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// GoogleFontsValidator checks font names against the Google Fonts catalog.
type GoogleFontsValidator interface {
	IsValidFont(name string) bool
	ListFontFamilies() []string
}

type GoogleFontsCache struct {
	apiKey     string
	// listEndpoint overrides webfontsListURL when non-empty (tests).
	listEndpoint string
	mu         sync.RWMutex
	names      map[string]string // lowercase family -> canonical family
	loadedAt   time.Time
	ttl        time.Duration
	httpClient *http.Client
}

func NewGoogleFontsCache(apiKey string) *GoogleFontsCache {
	return &GoogleFontsCache{
		apiKey: strings.TrimSpace(apiKey),
		names:  make(map[string]string),
		ttl:    24 * time.Hour,
		httpClient: &http.Client{Timeout: 20 * time.Second},
	}
}

func (c *GoogleFontsCache) IsValidFont(name string) bool {
	name = strings.TrimSpace(name)
	if name == "" {
		return false
	}
	c.ensureLoaded()
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.names[strings.ToLower(name)]
	return ok
}

func (c *GoogleFontsCache) ListFontFamilies() []string {
	c.ensureLoaded()
	c.mu.RLock()
	defer c.mu.RUnlock()
	seen := make(map[string]struct{}, len(c.names))
	out := make([]string, 0, len(c.names))
	for _, canonical := range c.names {
		if _, ok := seen[canonical]; ok {
			continue
		}
		seen[canonical] = struct{}{}
		out = append(out, canonical)
	}
	sort.Strings(out)
	return out
}

func (c *GoogleFontsCache) ensureLoaded() {
	c.mu.RLock()
	stale := len(c.names) == 0 || time.Since(c.loadedAt) > c.ttl
	c.mu.RUnlock()
	if !stale {
		return
	}
	_ = c.Refresh(context.Background())
}

func (c *GoogleFontsCache) webfontsListURL() string {
	params := url.Values{}
	params.Set("sort", "popularity")
	if c.apiKey != "" {
		params.Set("key", c.apiKey)
	}
	return "https://www.googleapis.com/webfonts/v1/webfonts?" + params.Encode()
}

func (c *GoogleFontsCache) Refresh(ctx context.Context) error {
	endpoint := c.webfontsListURL()
	if c.listEndpoint != "" {
		endpoint = c.listEndpoint
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
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
		return fmt.Errorf("google fonts API: HTTP %d", resp.StatusCode)
	}
	var payload struct {
		Items []struct {
			Family string `json:"family"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		c.seedFallback()
		return err
	}
	next := make(map[string]string, len(payload.Items))
	for _, item := range payload.Items {
		f := strings.TrimSpace(item.Family)
		if f != "" {
			next[strings.ToLower(f)] = f
		}
	}
	if len(next) == 0 {
		c.seedFallback()
		return fmt.Errorf("google fonts API returned no fonts")
	}
	c.mu.Lock()
	c.names = next
	c.loadedAt = time.Now()
	c.mu.Unlock()
	return nil
}

func (c *GoogleFontsCache) seedFallback() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.names) > 0 {
		return
	}
	for _, f := range []string{
		"Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Source Sans 3",
		"Nunito", "Raleway", "Work Sans", "Lexend", "Atkinson Hyperlegible",
	} {
		c.names[strings.ToLower(f)] = f
	}
	c.loadedAt = time.Now()
}
