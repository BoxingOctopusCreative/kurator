package validation

import (
	"net/url"
	"regexp"
	"strings"
	"unicode"
)

// Limits align with web/lib/validation.ts LIMITS.
const (
	MaxTitle               = 512
	MaxName                = 256
	MaxDescription         = 4000
	MaxBio                 = 4000
	MaxShortText           = 512
	MaxURL                 = 2048
	MaxEmail               = 254
	MaxPassword            = 4096
	MaxSearchQuery         = 200
	MaxMetadataStr         = 2048
	MaxExtraJSON           = 65536
	MaxTotpDigits          = 12
	MaxPendingToken        = 8192
	MaxMetadataLookupQuery = 512
)

var (
	emailRx      = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
	suspiciousRx = regexp.MustCompile(`(?i)<\s*script|javascript\s*:|data\s*:\s*text/html|vbscript\s*:`)
	onHandlerRx  = regexp.MustCompile(`(?i)\bon[a-z]+\s*=`)
	keySafeRx    = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)
	ctrlSingleRx = regexp.MustCompile(`[\x00-\x1f\x7f]`)
	ctrlMultiRx  = regexp.MustCompile(`[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]`)
	dbHostRx     = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$`)
	dbUserNameRx = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
)

func assertMaxLen(s string, max int, field string) error {
	if len(s) > max {
		return Invalidf("%s must be at most %d characters", field, max)
	}
	return nil
}

// StrictPlainText rejects angle brackets, controls, and common XSS patterns (single-line).
func StrictPlainText(s string, maxLen int, field string, allowEmpty bool) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		if allowEmpty {
			return "", nil
		}
		return "", Invalidf("%s is required", field)
	}
	if err := assertMaxLen(t, maxLen, field); err != nil {
		return "", err
	}
	if strings.ContainsRune(t, '\x00') {
		return "", Invalidf("%s contains invalid characters", field)
	}
	if ctrlSingleRx.MatchString(t) {
		return "", Invalidf("%s contains invalid characters", field)
	}
	if strings.ContainsAny(t, "<>") {
		return "", Invalidf("%s cannot contain < or >", field)
	}
	if suspiciousRx.MatchString(t) || onHandlerRx.MatchString(t) {
		return "", Invalidf("%s contains disallowed content", field)
	}
	return t, nil
}

// LooseMultilineText allows newlines; still blocks script-like payloads.
func LooseMultilineText(s string, maxLen int, field string, allowEmpty bool) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		if allowEmpty {
			return "", nil
		}
		return "", Invalidf("%s is required", field)
	}
	if err := assertMaxLen(t, maxLen, field); err != nil {
		return "", err
	}
	if strings.ContainsRune(t, '\x00') {
		return "", Invalidf("%s contains invalid characters", field)
	}
	if ctrlMultiRx.MatchString(t) {
		return "", Invalidf("%s contains invalid characters", field)
	}
	if regexp.MustCompile(`(?i)<\s*script`).MatchString(t) || suspiciousRx.MatchString(t) || onHandlerRx.MatchString(t) {
		return "", Invalidf("%s contains disallowed content", field)
	}
	return t, nil
}

// HTTPOrHTTPSURL validates a URL uses http or https.
func HTTPOrHTTPSURL(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if err := assertMaxLen(t, MaxURL, field); err != nil {
		return "", err
	}
	u, err := url.Parse(t)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", Invalidf("%s must be a valid URL", field)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", Invalidf("%s must use http or https", field)
	}
	return t, nil
}

// OptionalHTTPURL returns empty string or a validated http(s) URL.
func OptionalHTTPURL(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", nil
	}
	return HTTPOrHTTPSURL(t, field)
}

// Email trims and validates length and shape.
func Email(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if err := assertMaxLen(t, MaxEmail, field); err != nil {
		return "", err
	}
	if !emailRx.MatchString(t) {
		return "", Invalidf("%s must be a valid email address", field)
	}
	return t, nil
}

// Password rejects NUL and enforces length bounds for API requests.
func Password(s string, field string) error {
	if strings.ContainsRune(s, '\x00') {
		return Invalidf("%s contains invalid characters", field)
	}
	if len(s) < 8 {
		return Invalidf("%s must be at least 8 characters", field)
	}
	return assertMaxLen(s, MaxPassword, field)
}

// SearchQuery validates optional collection search text.
func SearchQuery(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", nil
	}
	return StrictPlainText(t, MaxSearchQuery, field, false)
}

// TotpCode normalizes spaces and validates digits.
func TotpCode(s string, field string) (string, error) {
	var b strings.Builder
	for _, r := range s {
		if unicode.IsSpace(r) {
			continue
		}
		b.WriteRune(r)
	}
	digits := b.String()
	if len(digits) < 6 || len(digits) > 10 {
		return "", Invalidf("%s must be 6–10 digits", field)
	}
	for _, r := range digits {
		if r < '0' || r > '9' {
			return "", Invalidf("%s must be 6–10 digits", field)
		}
	}
	if err := assertMaxLen(digits, MaxTotpDigits, field); err != nil {
		return "", err
	}
	return digits, nil
}

// RecoveryCode6 validates a 6-digit email recovery code.
func RecoveryCode6(s string, field string) (string, error) {
	digits := strings.TrimSpace(s)
	digits = strings.ReplaceAll(digits, " ", "")
	if len(digits) != 6 {
		return "", Invalidf("%s must be 6 digits", field)
	}
	for _, r := range digits {
		if r < '0' || r > '9' {
			return "", Invalidf("%s must be 6 digits", field)
		}
	}
	return digits, nil
}

// PendingLoginToken bounds the 2FA pending JWT string.
func PendingLoginToken(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", Invalidf("%s is invalid", field)
	}
	if strings.ContainsRune(t, '\x00') {
		return "", Invalidf("%s contains invalid characters", field)
	}
	if err := assertMaxLen(t, MaxPendingToken, field); err != nil {
		return "", err
	}
	return t, nil
}
