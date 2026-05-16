package validation

import (
	"encoding/base64"
	"strings"
	"unicode/utf8"
)

// HitlistSlug normalizes and validates a globally unique permalink segment (lowercase a-z0-9 and hyphens).
func HitlistSlug(s string) (string, error) {
	t := strings.TrimSpace(strings.ToLower(s))
	if t == "" {
		return "", Invalidf("slug required")
	}
	if utf8.RuneCountInString(t) < 3 || len(t) > 100 {
		return "", Invalidf("slug must be 3–100 characters")
	}
	for _, r := range t {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			continue
		}
		return "", Invalidf("slug may only contain lowercase letters, digits, and hyphens")
	}
	if strings.HasPrefix(t, "-") || strings.HasSuffix(t, "-") {
		return "", Invalidf("slug must not start or end with a hyphen")
	}
	if strings.Contains(t, "--") {
		return "", Invalidf("slug must not contain consecutive hyphens")
	}
	return t, nil
}

// HitlistSlugCollisionSuffix returns the alphanumeric-only portion of base64(last UTF-8 bytes of the last three runes of stem).
func HitlistSlugCollisionSuffix(stem string) string {
	rs := []rune(strings.TrimSpace(stem))
	var tail string
	switch len(rs) {
	case 0:
		tail = ""
	case 1, 2:
		tail = string(rs)
	default:
		tail = string(rs[len(rs)-3:])
	}
	enc := base64.StdEncoding.EncodeToString([]byte(tail))
	var b strings.Builder
	for _, c := range enc {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') {
			b.WriteRune(c)
		}
	}
	return b.String()
}
