package validation

import (
	"net/url"
	"strconv"
	"strings"
)

const maxPostgresURLLen = 2000

var sslModes = map[string]struct{}{
	"disable": {}, "allow": {}, "prefer": {}, "require": {}, "verify-ca": {}, "verify-full": {},
}

// PostgresDatabaseURL validates postgres:// or postgresql:// URLs.
func PostgresDatabaseURL(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", Invalidf("%s is required", field)
	}
	if err := assertMaxLen(t, maxPostgresURLLen, field); err != nil {
		return "", err
	}
	u, err := url.Parse(t)
	if err != nil {
		return "", Invalidf("%s must be a valid URL", field)
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return "", Invalidf("%s must start with postgres:// or postgresql://", field)
	}
	return t, nil
}

func isIPv4(s string) bool {
	parts := strings.Split(s, ".")
	if len(parts) != 4 {
		return false
	}
	for _, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || n > 255 {
			return false
		}
	}
	return true
}

// DBHost allows localhost, IPv4, or a simple hostname.
func DBHost(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", Invalidf("%s is required", field)
	}
	if err := assertMaxLen(t, 253, field); err != nil {
		return "", err
	}
	if strings.ContainsRune(t, '\x00') || strings.ContainsAny(t, "<>") || strings.ContainsAny(t, " \t\r\n") {
		return "", Invalidf("%s contains invalid characters", field)
	}
	if t == "localhost" || isIPv4(t) {
		return t, nil
	}
	if dbHostRx.MatchString(t) {
		return t, nil
	}
	return "", Invalidf("%s must be a valid hostname or IPv4 address", field)
}

// DBUserOrName validates Postgres user/database identifier-style strings.
func DBUserOrName(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", Invalidf("%s is required", field)
	}
	if err := assertMaxLen(t, 128, field); err != nil {
		return "", err
	}
	if strings.ContainsRune(t, '\x00') || strings.ContainsAny(t, "<>") || strings.ContainsAny(t, " \t\r\n") {
		return "", Invalidf("%s contains invalid characters", field)
	}
	if !dbUserNameRx.MatchString(t) {
		return "", Invalidf("%s may only contain letters, numbers, underscores, and hyphens", field)
	}
	return t, nil
}

// DBPassword bounds password length for setup forms.
func DBPassword(s string, field string) error {
	if strings.ContainsRune(s, '\x00') {
		return Invalidf("%s contains invalid characters", field)
	}
	return assertMaxLen(s, MaxPassword, field)
}

// SSLMode returns a normalized sslmode query value.
func SSLMode(s string, field string) (string, error) {
	t := strings.TrimSpace(strings.ToLower(s))
	if t == "" {
		t = "disable"
	}
	if _, ok := sslModes[t]; !ok {
		return "", Invalidf("%s is invalid", field)
	}
	return t, nil
}

// Port validates 1–65535.
func Port(n int, field string) error {
	if n < 1 || n > 65535 {
		return Invalidf("%s must be between 1 and 65535", field)
	}
	return nil
}
