package validation

import (
	"encoding/json"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

func TestStrictPlainText_rejectsAngleBrackets(t *testing.T) {
	_, err := StrictPlainText("<script>x</script>", 100, "t", false)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestHTTPOrHTTPSURL_rejectsJavascript(t *testing.T) {
	_, err := HTTPOrHTTPSURL("javascript:alert(1)", "u")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestNormalizeOptionalPurchaseURLPointer(t *testing.T) {
	empty := ""
	got, err := NormalizeOptionalPurchaseURLPointer(&empty, "Purchase link")
	if err != nil || got == nil || *got != "" {
		t.Fatalf("empty: got %v err %v", got, err)
	}
	raw := "https://www.amazon.com/dp/example"
	got, err = NormalizeOptionalPurchaseURLPointer(&raw, "Purchase link")
	if err != nil || got == nil || *got != raw {
		t.Fatalf("url: got %v err %v", got, err)
	}
	bad := "not-a-url"
	_, err = NormalizeOptionalPurchaseURLPointer(&bad, "Purchase link")
	if err == nil {
		t.Fatal("expected error for invalid url")
	}
}

func TestSanitizeItemMetadata_gameEmpty(t *testing.T) {
	out, err := SanitizeItemMetadata(models.CategoryGame, []byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != "{}" {
		t.Fatalf("got %s", out)
	}
}

func TestSanitizeItemMetadata_rejectsScriptString(t *testing.T) {
	_, err := SanitizeItemMetadata(models.CategoryGame, []byte(`{"platform":"<script>"}`))
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestSanitizeItemMetadata_videoFormat(t *testing.T) {
	_, err := SanitizeItemMetadata(models.CategoryMovies, []byte(`{"format":"dvd"}`))
	if err != nil {
		t.Fatal(err)
	}
	_, err = SanitizeItemMetadata(models.CategoryMovies, []byte(`{"format":"bad"}`))
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestSanitizeItemMetadata_tvEdition(t *testing.T) {
	_, err := SanitizeItemMetadata(models.CategoryTV, []byte(`{"tv_edition":"box_set"}`))
	if err != nil {
		t.Fatal(err)
	}
	_, err = SanitizeItemMetadata(models.CategoryTV, []byte(`{"tv_edition":"single_season","tv_season":3}`))
	if err != nil {
		t.Fatal(err)
	}
	_, err = SanitizeItemMetadata(models.CategoryTV, []byte(`{"tv_edition":"single_season"}`))
	if err == nil {
		t.Fatal("expected error without tv_season")
	}
	_, err = SanitizeItemMetadata(models.CategoryTV, []byte(`{"tv_edition":"box_set","tv_season":1}`))
	if err == nil {
		t.Fatal("expected error tv_season with box_set")
	}
	_, err = SanitizeItemMetadata(models.CategoryMovies, []byte(`{"tv_edition":"box_set"}`))
	if err == nil {
		t.Fatal("expected error tv_edition on movies")
	}
}

func TestSanitizeItemMetadata_tvOrphanSeason(t *testing.T) {
	_, err := SanitizeItemMetadata(models.CategoryTV, []byte(`{"tv_season":2}`))
	if err == nil {
		t.Fatal("expected error orphan tv_season")
	}
}

func TestCollectionSort_default(t *testing.T) {
	s, err := CollectionSort("")
	if err != nil || s != "name_asc" {
		t.Fatalf("got %q %v", s, err)
	}
}

func TestSearchQuery_empty(t *testing.T) {
	s, err := SearchQuery("   ", "q")
	if err != nil || s != "" {
		t.Fatalf("got %q %v", s, err)
	}
}

func TestMetadataJSON_roundTrip(t *testing.T) {
	raw := []byte(`{"platform":"SNES","year":1995}`)
	out, err := SanitizeItemMetadata(models.CategoryGame, raw)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	if m["platform"] != "SNES" || m["year"].(float64) != 1995 {
		t.Fatalf("%v", m)
	}
}

func TestHitlistSlug_ok(t *testing.T) {
	s, err := HitlistSlug("my-80s-horror")
	if err != nil || s != "my-80s-horror" {
		t.Fatalf("got %q err %v", s, err)
	}
}

func TestHitlistSlug_rejectsInvalid(t *testing.T) {
	if _, err := HitlistSlug("bad_slug"); err == nil {
		t.Fatal("expected error")
	}
}

func TestHitlistSlugCollisionSuffix(t *testing.T) {
	s := HitlistSlugCollisionSuffix("my-80s-horror")
	if s == "" {
		t.Fatal("empty suffix")
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
			t.Fatalf("non-alnum %q in %q", c, s)
		}
	}
}
