package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestGoogleFontsCacheRefreshWithAPIKey(t *testing.T) {
	var gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.URL.Query().Get("key")
		_, _ = w.Write([]byte(`{"items":[{"family":"Inter"},{"family":"Roboto Slab"}]}`))
	}))
	defer srv.Close()

	cache := NewGoogleFontsCache("test-api-key")
	cache.httpClient = srv.Client()
	cache.listEndpoint = srv.URL + "?sort=popularity&key=test-api-key"

	if err := cache.Refresh(context.Background()); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if gotKey != "test-api-key" {
		t.Fatalf("expected key query param test-api-key, got %q", gotKey)
	}
	if !cache.IsValidFont("Roboto Slab") {
		t.Fatal("expected Roboto Slab to validate")
	}
	families := cache.ListFontFamilies()
	if len(families) != 2 || families[0] != "Inter" || families[1] != "Roboto Slab" {
		t.Fatalf("unexpected families: %#v", families)
	}
	if cache.IsValidFont("Not A Real Font") {
		t.Fatal("unexpected font should not validate")
	}
}

func TestGoogleFontsCacheWebfontsListURL(t *testing.T) {
	withKey := NewGoogleFontsCache("abc123")
	u, err := url.Parse(withKey.webfontsListURL())
	if err != nil {
		t.Fatal(err)
	}
	if u.Query().Get("key") != "abc123" {
		t.Fatalf("expected key=abc123, got %q", u.Query().Get("key"))
	}

	withoutKey := NewGoogleFontsCache("")
	u2, err := url.Parse(withoutKey.webfontsListURL())
	if err != nil {
		t.Fatal(err)
	}
	if u2.Query().Get("key") != "" {
		t.Fatalf("expected no key when unset, got %q", u2.Query().Get("key"))
	}
}
