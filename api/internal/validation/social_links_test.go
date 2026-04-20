package validation

import (
	"encoding/json"
	"testing"
)

func TestSocialLinksJSON_normalizes(t *testing.T) {
	raw := []byte(`[{"platform":"github","url":"https://github.com/octo"}]`)
	out, err := SocialLinksJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	var items []normalizedSocialLink
	if err := json.Unmarshal(out, &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Platform != "github" || items[0].URL != "https://github.com/octo" {
		t.Fatalf("got %+v", items)
	}
}

func TestSocialLinksJSON_legacyInfersPlatform(t *testing.T) {
	raw := []byte(`[{"label":"x","url":"https://x.com/kurator"}]`)
	out, err := SocialLinksJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	var items []normalizedSocialLink
	if err := json.Unmarshal(out, &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Platform != "x" {
		t.Fatalf("got %+v", items)
	}
}

func TestSocialLinksJSON_platformMismatch(t *testing.T) {
	raw := []byte(`[{"platform":"github","url":"https://facebook.com/zuck"}]`)
	_, err := SocialLinksJSON(raw)
	if err == nil {
		t.Fatal("expected error")
	}
}
