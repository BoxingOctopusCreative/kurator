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
