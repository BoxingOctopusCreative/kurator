package validation

import "strings"

const (
	FontFamilyDefault                = "default"
	FontFamilySans                   = "sans"
	FontFamilySerif                  = "serif"
	FontFamilyMono                   = "mono"
	FontFamilyAccessibleLexend       = "accessible_lexend"
	FontFamilyAccessibleAtkinson     = "accessible_atkinson"
	FontFamilyAccessibleOpenDyslexic = "accessible_opendyslexic"
)

// IsAccessibleFontFamily reports whether f requires accessible_fonts_enabled.
func IsAccessibleFontFamily(f string) bool {
	switch strings.ToLower(strings.TrimSpace(f)) {
	case FontFamilyAccessibleLexend, FontFamilyAccessibleAtkinson, FontFamilyAccessibleOpenDyslexic:
		return true
	default:
		return false
	}
}

// FontFamily normalizes and validates UI font id. accessibleExtrasEnabled must be true for accessible_*.
func FontFamily(raw string, accessibleExtrasEnabled bool) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		s = FontFamilyDefault
	}
	switch s {
	case FontFamilyDefault, FontFamilySans, FontFamilySerif, FontFamilyMono:
		return s, nil
	case FontFamilyAccessibleLexend, FontFamilyAccessibleAtkinson, FontFamilyAccessibleOpenDyslexic:
		if !accessibleExtrasEnabled {
			return "", &InvalidInputError{Message: "turn on accessible fonts to use this face"}
		}
		return s, nil
	default:
		return "", &InvalidInputError{Message: "font_family must be a supported UI font"}
	}
}
