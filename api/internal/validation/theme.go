package validation

import "strings"

// ThemePreference normalizes and validates UI theme choice (stored on the user record).
func ThemePreference(raw string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	switch s {
	case "system", "light", "dark":
		return s, nil
	default:
		return "", &InvalidInputError{Message: "theme_preference must be system, light, or dark"}
	}
}
