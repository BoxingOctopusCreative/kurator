package validation

import (
	"regexp"
	"strings"
)

var usernamePattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,28}[a-z0-9]$`)

var reservedUsernames = map[string]struct{}{
	"search":    {},
	"followers": {},
	"following": {},
	"follow":    {},
}

// Username validates a URL-safe handle (3–30 chars, lowercase, [a-z0-9_-], not all digits).
func Username(s string) (string, error) {
	t := strings.ToLower(strings.TrimSpace(s))
	if len(t) < 3 || len(t) > 30 {
		return "", Invalidf("Username must be 3–30 characters")
	}
	if !usernamePattern.MatchString(t) {
		return "", Invalidf("Username may only use lowercase letters, digits, underscores, and hyphens, and must start with a letter")
	}
	digitsOnly := true
	for _, r := range t {
		if r < '0' || r > '9' {
			digitsOnly = false
			break
		}
	}
	if digitsOnly {
		return "", Invalidf("Username cannot be only digits")
	}
	if _, ok := reservedUsernames[t]; ok {
		return "", Invalidf("That username is reserved")
	}
	return t, nil
}

// SuggestUsernameBase builds a candidate handle from an email local part (not guaranteed valid or unique).
func SuggestUsernameBase(email string) string {
	at := strings.IndexByte(email, '@')
	local := strings.ToLower(strings.TrimSpace(email))
	if at > 0 {
		local = strings.ToLower(strings.TrimSpace(email[:at]))
	}
	var b strings.Builder
	for _, r := range local {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '_':
			b.WriteRune(r)
		case r == '.', r == '-', r == '+':
			b.WriteByte('_')
		}
	}
	s := strings.Trim(b.String(), "_")
	for strings.Contains(s, "__") {
		s = strings.ReplaceAll(s, "__", "_")
	}
	if len(s) < 3 {
		s = "collector"
	}
	if len(s) > 30 {
		s = s[:30]
	}
	s = strings.TrimRight(s, "_-")
	if len(s) < 3 {
		s = "collector"
	}
	return s
}
