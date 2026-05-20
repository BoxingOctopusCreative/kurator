package validation

import (
	"encoding/base64"
	"strings"
	"unicode/utf8"
)

// HitlistSlugFromTitle derives a permalink slug from a hitlist display name.
func HitlistSlugFromTitle(name string) string {
	t := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	prevHyphen := false
	for _, r := range t {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevHyphen = false
			continue
		}
		if b.Len() > 0 && !prevHyphen {
			b.WriteRune('-')
			prevHyphen = true
		}
	}
	s := strings.Trim(b.String(), "-")
	if s == "" {
		return "hitlist"
	}
	if len(s) > 48 {
		rs := []rune(s)
		s = strings.TrimRight(string(rs[:48]), "-")
	}
	if s == "" {
		return "hitlist"
	}
	if utf8.RuneCountInString(s) < 3 {
		return s + "-list"
	}
	return s
}

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

// HitlistSlugCollisionSuffix returns six lowercase alphanumeric characters derived from base64(name).
func HitlistSlugCollisionSuffix(name string) string {
	return HitlistSlugCollisionSuffixAt(name, 0)
}

// HitlistSlugCollisionSuffixAt returns a six-character suffix using the nth block of alnum chars from base64(name).
func HitlistSlugCollisionSuffixAt(name string, block int) string {
	if block < 0 {
		block = 0
	}
	alnum := hitlistSlugCollisionAlpnum(name)
	start := block * 6
	if start >= len(alnum) {
		start = 0
	}
	end := start + 6
	if end > len(alnum) {
		alnum = expandHitlistSlugCollisionAlpnum(alnum)
		end = start + 6
		if end > len(alnum) {
			end = len(alnum)
		}
	}
	if start >= len(alnum) {
		return "000000"
	}
	return alnum[start:end]
}

func hitlistSlugCollisionAlpnum(name string) string {
	enc := base64.StdEncoding.EncodeToString([]byte(strings.TrimSpace(name)))
	var b strings.Builder
	for _, c := range enc {
		switch {
		case c >= 'a' && c <= 'z', c >= '0' && c <= '9':
			b.WriteRune(c)
		case c >= 'A' && c <= 'Z':
			b.WriteRune(c - 'A' + 'a')
		}
	}
	return b.String()
}

func expandHitlistSlugCollisionAlpnum(s string) string {
	if s == "" {
		return "000000"
	}
	for len(s) < 48 {
		s += s
	}
	return s
}
