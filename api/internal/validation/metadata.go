package validation

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

const (
	maxMetadataDepth = 12
	maxMetadataKeys  = 300
	maxArrayLen      = 500
	maxKeyLen        = 64
)

// SanitizeItemMetadata validates category-specific fields and recursively sanitizes all string values
// in metadata JSON (defense in depth for stored XSS payloads).
func SanitizeItemMetadata(cat models.Category, raw []byte) ([]byte, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return []byte("{}"), nil
	}
	if len(raw) > MaxExtraJSON {
		return nil, Invalidf("metadata is too large (max %d bytes)", MaxExtraJSON)
	}
	var top map[string]interface{}
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, Invalidf("metadata must be valid JSON")
	}
	for k := range top {
		if !keySafeRx.MatchString(k) || len(k) > maxKeyLen {
			return nil, Invalidf("invalid metadata key: %s", k)
		}
	}
	if len(top) > maxMetadataKeys {
		return nil, Invalidf("metadata has too many keys")
	}
	if err := validateCategoryMetadata(cat, top); err != nil {
		return nil, err
	}
	out, err := sanitizeJSONValue(top, 0, "")
	if err != nil {
		return nil, err
	}
	om, ok := out.(map[string]interface{})
	if !ok {
		return nil, Invalidf("metadata must be a JSON object")
	}
	return json.Marshal(om)
}

func validateCategoryMetadata(cat models.Category, m map[string]interface{}) error {
	switch cat {
	case models.CategoryMusic:
		return validateMusicMetadata(m)
	case models.CategoryGame:
		return validateGameMetadata(m)
	case models.CategoryVideo:
		return validateVideoMetadata(m)
	case models.CategoryBook, models.CategoryManga:
		return validateBookMetadata(m)
	case models.CategoryComicBook:
		return validateComicMetadata(m)
	default:
		return Invalidf("invalid category")
	}
}

func validateMusicMetadata(m map[string]interface{}) error {
	if err := validateYearKey(m, "year"); err != nil {
		return err
	}
	if v, ok := m["format"]; ok && v != nil {
		if err := validateMusicFormat(v); err != nil {
			return err
		}
	}
	return validateCoverArt(m)
}

func validateGameMetadata(m map[string]interface{}) error {
	if err := validateYearKey(m, "year"); err != nil {
		return err
	}
	return validateCoverArt(m)
}

func validateVideoMetadata(m map[string]interface{}) error {
	if err := validateYearKey(m, "year"); err != nil {
		return err
	}
	if v, ok := m["format"]; ok && v != nil {
		if err := validateVideoFormat(v); err != nil {
			return err
		}
	}
	if v, ok := m["video_type"]; ok && v != nil {
		if err := validateVideoType(v); err != nil {
			return err
		}
	}
	return validateCoverArt(m)
}

func validateBookMetadata(m map[string]interface{}) error {
	if err := validateYearKey(m, "year"); err != nil {
		return err
	}
	return validateCoverArt(m)
}

func validateComicMetadata(m map[string]interface{}) error {
	if err := validateYearKey(m, "year"); err != nil {
		return err
	}
	if v, ok := m["single_issue"]; ok && v != nil {
		if _, ok := v.(bool); !ok {
			return Invalidf("single_issue must be a boolean")
		}
	}
	return validateCoverArt(m)
}

func validateCoverArt(m map[string]interface{}) error {
	v, ok := m["cover_art"]
	if !ok || v == nil {
		return nil
	}
	s, ok := v.(string)
	if !ok {
		return Invalidf("cover_art must be a string")
	}
	_, err := OptionalHTTPURL(s, "Cover art URL")
	return err
}

func validateYearKey(m map[string]interface{}, key string) error {
	v, ok := m[key]
	if !ok || v == nil {
		return nil
	}
	_, err := parseYearValue(v, "Year")
	return err
}

func parseYearValue(v interface{}, field string) (int, error) {
	switch x := v.(type) {
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return 0, Invalidf("%s is invalid", field)
		}
		yi := int(x)
		if float64(yi) != x {
			return 0, Invalidf("%s must be a whole year", field)
		}
		if yi < 1000 || yi > 9999 {
			return 0, Invalidf("%s must be between 1000 and 9999", field)
		}
		return yi, nil
	case string:
		s := strings.TrimSpace(x)
		if len(s) != 4 {
			return 0, Invalidf("%s must be a 4-digit year", field)
		}
		yi, err := strconv.Atoi(s)
		if err != nil || yi < 1000 || yi > 9999 {
			return 0, Invalidf("%s must be a 4-digit year", field)
		}
		return yi, nil
	default:
		return 0, Invalidf("%s must be a number or string", field)
	}
}

func validateMusicFormat(v interface{}) error {
	s, ok := v.(string)
	if !ok {
		return Invalidf("format must be a string")
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	switch s {
	case "vinyl", "cd", "tape", "other":
		return nil
	default:
		_, err := StrictPlainText(s, MaxShortText, "format", false)
		return err
	}
}

func validateVideoFormat(v interface{}) error {
	s, ok := v.(string)
	if !ok {
		return Invalidf("format must be a string")
	}
	switch strings.TrimSpace(s) {
	case "":
		return nil
	case "vhs", "dvd", "blu_ray":
		return nil
	default:
		return Invalidf("invalid video format")
	}
}

func validateVideoType(v interface{}) error {
	s, ok := v.(string)
	if !ok {
		return Invalidf("video_type must be a string")
	}
	switch strings.TrimSpace(s) {
	case "":
		return nil
	case "series", "movie":
		return nil
	default:
		return Invalidf("invalid video type")
	}
}

func sanitizeJSONValue(val interface{}, depth int, path string) (interface{}, error) {
	if depth > maxMetadataDepth {
		return nil, Invalidf("metadata is nested too deeply")
	}
	if val == nil {
		return nil, nil
	}
	switch t := val.(type) {
	case bool:
		return t, nil
	case float64:
		if math.IsNaN(t) || math.IsInf(t, 0) {
			return nil, Invalidf("invalid number in metadata%s", pathSuffix(path))
		}
		return t, nil
	case string:
		label := path
		if label == "" {
			label = "metadata"
		}
		if label == "notes" || strings.HasSuffix(path, ".notes") {
			return LooseMultilineText(t, MaxDescription, "Notes", true)
		}
		return StrictPlainText(t, MaxMetadataStr, label, true)
	case []interface{}:
		if len(t) > maxArrayLen {
			return nil, Invalidf("metadata array is too large")
		}
		out := make([]interface{}, len(t))
		for i, item := range t {
			var err error
			p := fmt.Sprintf("%s[%d]", path, i)
			out[i], err = sanitizeJSONValue(item, depth+1, p)
			if err != nil {
				return nil, err
			}
		}
		return out, nil
	case map[string]interface{}:
		if len(t) > maxMetadataKeys {
			return nil, Invalidf("metadata has too many keys")
		}
		out := make(map[string]interface{}, len(t))
		for k, v := range t {
			if !keySafeRx.MatchString(k) || len(k) > maxKeyLen {
				return nil, Invalidf("invalid metadata key: %s", k)
			}
			p := k
			if path != "" {
				p = path + "." + k
			}
			sv, err := sanitizeJSONValue(v, depth+1, p)
			if err != nil {
				return nil, err
			}
			out[k] = sv
		}
		return out, nil
	default:
		return nil, Invalidf("metadata has an unsupported value type%s", pathSuffix(path))
	}
}

func pathSuffix(path string) string {
	if path == "" {
		return ""
	}
	return " (" + path + ")"
}

// ItemTitle validates the item title field.
func ItemTitle(s string) (string, error) {
	return StrictPlainText(s, MaxTitle, "Title", false)
}

// OptionalItemRating validates an optional 1–5 star rating (nil = unrated).
func OptionalItemRating(p *int) (*int, error) {
	if p == nil {
		return nil, nil
	}
	if *p < 1 || *p > 5 {
		return nil, fmt.Errorf("rating must be between 1 and 5")
	}
	return p, nil
}

// CollectionOrWishlistName validates a collection or wishlist name.
func CollectionOrWishlistName(s string, field string) (string, error) {
	return StrictPlainText(s, MaxName, field, false)
}

// CollectionDescription validates optional multiline description.
func CollectionDescription(s string) (string, error) {
	return LooseMultilineText(s, MaxDescription, "Description", true)
}

// ProfileDisplayName validates display name (required non-empty when updating).
func ProfileDisplayName(s string) (string, error) {
	return StrictPlainText(s, MaxName, "Display name", false)
}

// ProfileBio validates optional bio.
func ProfileBio(s string) (string, error) {
	return LooseMultilineText(s, MaxBio, "Bio", true)
}

// ProfileFirstName validates optional legal first name (may be shown when marked public).
func ProfileFirstName(s string) (string, error) {
	return LooseMultilineText(s, 128, "First name", true)
}

// ProfileLastName validates optional legal last name (may be shown when marked public).
func ProfileLastName(s string) (string, error) {
	return LooseMultilineText(s, 128, "Last name", true)
}

// ProfileLocation validates optional location (city, country, etc.).
func ProfileLocation(s string) (string, error) {
	return LooseMultilineText(s, 128, "Location", true)
}
