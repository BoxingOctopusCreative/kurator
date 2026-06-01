package service

import (
	"strings"
	"testing"
)

type stubGoogleFonts struct{}

func (stubGoogleFonts) IsValidFont(name string) bool {
	return strings.EqualFold(strings.TrimSpace(name), "Inter")
}

func (stubGoogleFonts) ListFontFamilies() []string {
	return []string{"Inter", "Roboto", "Open Sans"}
}

type stubIconify struct{}

func (stubIconify) IsValidCollection(name string) bool {
	return strings.EqualFold(strings.TrimSpace(name), "lucide")
}

func validThemeYAML() string {
	return `---
customTheme:
  schemaVersion: "v1"
  meta:
    name: "test-theme"
    description: "A test theme"
    published: false
  branding:
    logo:
      url: "https://assets.kuratorapp.cc/brand/PNG/kurator_favicon-white.png"
  appearance:
    colors:
      primary: "#000000"
      secondary: "#FFFFFF"
      background: "#121212"
      surface: "#1E1E1E"
      accent: "#6200EE"
      text: "#FFFFFF"
      border: "#333333"
      interactive: "#BB86FC"
    font:
      source: "google"
      name: "Inter"
      size: 16
      lineHeight: 1.5
      display: "swap"
      fallback: "system-ui"
    icons:
      source: "iconify"
      set: "lucide"
`
}

func TestParseAndValidateCustomThemeYAML_valid(t *testing.T) {
	result := ParseAndValidateCustomThemeYAML([]byte(validThemeYAML()), stubGoogleFonts{}, stubIconify{})
	if !result.Valid {
		t.Fatalf("expected valid theme, got errors: %+v", result.Errors)
	}
	if result.Theme.Meta.Name != "test-theme" {
		t.Fatalf("unexpected name: %q", result.Theme.Meta.Name)
	}
}

func TestParseAndValidateCustomThemeYAML_rejectsPublishedTrue(t *testing.T) {
	raw := strings.Replace(validThemeYAML(), "published: false", "published: true", 1)
	result := ParseAndValidateCustomThemeYAML([]byte(raw), stubGoogleFonts{}, stubIconify{})
	if result.Valid {
		t.Fatal("expected invalid when published is true")
	}
}

func TestParseAndValidateCustomThemeYAML_rejectsAuthorBlock(t *testing.T) {
	raw := strings.Replace(validThemeYAML(), "published: false", "published: false\n    author:\n      displayName: \"x\"", 1)
	result := ParseAndValidateCustomThemeYAML([]byte(raw), stubGoogleFonts{}, stubIconify{})
	if result.Valid {
		t.Fatal("expected invalid when author block is present")
	}
}

func TestParseAndValidateCustomThemeYAML_rejectsAnchors(t *testing.T) {
	raw := "anchor: &x {}\n" + validThemeYAML()
	result := ParseAndValidateCustomThemeYAML([]byte(raw), stubGoogleFonts{}, stubIconify{})
	if result.Valid {
		t.Fatal("expected invalid when YAML anchors are present")
	}
}

func TestParseAndValidateCustomThemeYAML_rejectsBadColor(t *testing.T) {
	raw := strings.Replace(validThemeYAML(), `primary: "#000000"`, `primary: "#000"`, 1)
	result := ParseAndValidateCustomThemeYAML([]byte(raw), stubGoogleFonts{}, stubIconify{})
	if result.Valid {
		t.Fatal("expected invalid hex color")
	}
}

func TestParseAndValidateCustomThemeYAML_rejectsHTTPLogo(t *testing.T) {
	raw := strings.Replace(validThemeYAML(), "https://assets", "http://assets", 1)
	result := ParseAndValidateCustomThemeYAML([]byte(raw), stubGoogleFonts{}, stubIconify{})
	if result.Valid {
		t.Fatal("expected invalid http logo url")
	}
}

func TestParseAndValidateCustomThemeYAML_typekitRequiresKitID(t *testing.T) {
	raw := strings.Replace(validThemeYAML(), `source: "google"`, `source: "typekit"`, 1)
	result := ParseAndValidateCustomThemeYAML([]byte(raw), stubGoogleFonts{}, stubIconify{})
	if result.Valid {
		t.Fatal("expected invalid typekit without kitId")
	}
}

func TestDefaultCustomThemeDocument_validates(t *testing.T) {
	doc := DefaultCustomThemeDocument()
	raw, err := MarshalCustomThemeYAML(doc)
	if err != nil {
		t.Fatal(err)
	}
	result := ParseAndValidateCustomThemeYAML(raw, stubGoogleFonts{}, stubIconify{})
	if !result.Valid {
		t.Fatalf("default theme should validate: %+v", result.Errors)
	}
}
