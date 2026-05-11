package validation

import (
	"strings"
)

const (
	ColorSchemeDefault                = "default"
	ColorSchemeDarcula                = "darcula"
	ColorSchemeCatppuccin             = "catppuccin"
	ColorSchemeSolarized              = "solarized"
	ColorSchemeOutrun                 = "outrun"
	ColorSchemeAccessibleOkabe        = "accessible_okabe"
	ColorSchemeAccessibleHighContrast = "accessible_high_contrast"
)

// IsAccessibleColorScheme reports whether s requires accessible_color_schemes_enabled.
func IsAccessibleColorScheme(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case ColorSchemeAccessibleOkabe, ColorSchemeAccessibleHighContrast:
		return true
	default:
		return false
	}
}

// ColorScheme normalizes and validates palette id. accessibleExtrasEnabled must be true to pick
// accessible_* schemes.
func ColorScheme(raw string, accessibleExtrasEnabled bool) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		s = ColorSchemeDefault
	}
	switch s {
	case ColorSchemeDefault, ColorSchemeDarcula, ColorSchemeCatppuccin, ColorSchemeSolarized, ColorSchemeOutrun:
		return s, nil
	case ColorSchemeAccessibleOkabe, ColorSchemeAccessibleHighContrast:
		if !accessibleExtrasEnabled {
			return "", &InvalidInputError{Message: "turn on accessible color schemes to use this palette"}
		}
		return s, nil
	default:
		return "", &InvalidInputError{Message: "color_scheme must be a supported palette"}
	}
}
