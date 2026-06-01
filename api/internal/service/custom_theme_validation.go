package service

import (
	"bytes"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"gopkg.in/yaml.v3"
)

const customThemeMaxBytes = 64 * 1024

var (
	ErrCustomThemeTooLarge      = errors.New("theme YAML exceeds 64KB limit")
	ErrCustomThemeYAMLAnchors   = errors.New("YAML anchors, aliases, and merge keys are not allowed")
	ErrCustomThemeProRequired   = errors.New("this feature requires Kurator Pro")
	ErrCustomThemeNotFound      = errors.New("custom theme not found")
	ErrCustomThemeRateLimited   = errors.New("theme upload limit reached (10 per day)")
	ErrCustomThemePublishedMeta = errors.New("meta.published must be false in user uploads")
	ErrCustomThemeAuthorInput   = errors.New("meta.author is set server-side at publish time only")
	ErrCustomThemeNotPublished  = errors.New("theme is not published")
	ErrCustomThemeStillPublished = errors.New("unpublish the theme before deleting it")
	ErrCannotRemoveOwnLibraryEntry = errors.New("cannot remove your own theme from the library; use delete theme instead")
)

var (
	customThemeHexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	customThemeAnchorRe   = regexp.MustCompile(`(?m)(^|\s)[*&](\w|\s)`)
	customThemeMergeRe    = regexp.MustCompile(`<<:\s*`)
)

// FieldError describes a single schema validation failure.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e FieldError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

type ValidationResult struct {
	Valid  bool         `json:"valid"`
	Theme  *models.CustomThemePayload `json:"theme,omitempty"`
	Errors []FieldError `json:"errors,omitempty"`
}

// ParseAndValidateCustomThemeYAML parses YAML safely and validates against customTheme v1.
func ParseAndValidateCustomThemeYAML(raw []byte, googleFonts GoogleFontsValidator, iconify IconifyValidator) ValidationResult {
	if len(raw) > customThemeMaxBytes {
		return ValidationResult{Errors: []FieldError{{Field: "document", Message: ErrCustomThemeTooLarge.Error()}}}
	}
	if err := rejectYAMLAnchors(raw); err != nil {
		return ValidationResult{Errors: []FieldError{{Field: "document", Message: err.Error()}}}
	}
	if err := rejectUserAuthorBlock(raw); err != nil {
		return ValidationResult{Errors: []FieldError{{Field: "meta.author", Message: err.Error()}}}
	}

	var doc models.CustomThemeDocument
	dec := yaml.NewDecoder(bytes.NewReader(raw))
	dec.KnownFields(true)
	if err := dec.Decode(&doc); err != nil {
		return ValidationResult{Errors: []FieldError{{Field: "document", Message: yamlParseError(err)}}}
	}
	var extra any
	if err := dec.Decode(&extra); err == nil {
		return ValidationResult{Errors: []FieldError{{Field: "document", Message: "only one YAML document is allowed"}}}
	}

	return validateCustomThemePayload(&doc.CustomTheme, googleFonts, iconify)
}

func rejectYAMLAnchors(raw []byte) error {
	s := string(raw)
	if customThemeAnchorRe.MatchString(s) || customThemeMergeRe.MatchString(s) {
		return ErrCustomThemeYAMLAnchors
	}
	return nil
}

func rejectUserAuthorBlock(raw []byte) error {
	var root yaml.Node
	if err := yaml.Unmarshal(raw, &root); err != nil {
		return nil
	}
	if hasAuthorNode(&root) {
		return ErrCustomThemeAuthorInput
	}
	return nil
}

func hasAuthorNode(n *yaml.Node) bool {
	if n == nil {
		return false
	}
	switch n.Kind {
	case yaml.DocumentNode, yaml.MappingNode, yaml.SequenceNode:
		for i := 0; i < len(n.Content); i++ {
			if hasAuthorNode(n.Content[i]) {
				return true
			}
		}
	case yaml.ScalarNode:
		if strings.EqualFold(strings.TrimSpace(n.Value), "author") {
			return true
		}
	}
	return false
}

func yamlParseError(err error) string {
	msg := strings.TrimSpace(err.Error())
	if strings.Contains(msg, "field ") && strings.Contains(msg, "not found") {
		return "unknown field in schema: " + msg
	}
	return msg
}

func validateCustomThemePayload(t *models.CustomThemePayload, googleFonts GoogleFontsValidator, iconify IconifyValidator) ValidationResult {
	var errs []FieldError
	add := func(field, msg string) {
		errs = append(errs, FieldError{Field: field, Message: msg})
	}

	if strings.TrimSpace(t.SchemaVersion) != models.CustomThemeSchemaVersion {
		add("customTheme.schemaVersion", fmt.Sprintf(`must be "%s"`, models.CustomThemeSchemaVersion))
	}
	if strings.TrimSpace(t.Meta.Name) == "" {
		add("customTheme.meta.name", "is required")
	} else if len(t.Meta.Name) > 120 {
		add("customTheme.meta.name", "must be at most 120 characters")
	}
	if len(t.Meta.Description) > 500 {
		add("customTheme.meta.description", "must be at most 500 characters")
	}
	if t.Meta.Published {
		add("customTheme.meta.published", ErrCustomThemePublishedMeta.Error())
	}

	validateColor := func(field, val string) {
		if !customThemeHexColorRe.MatchString(val) {
			add(field, "must match #RRGGBB hex format")
		}
	}
	c := t.Appearance.Colors
	validateColor("customTheme.appearance.colors.primary", c.Primary)
	validateColor("customTheme.appearance.colors.secondary", c.Secondary)
	validateColor("customTheme.appearance.colors.background", c.Background)
	validateColor("customTheme.appearance.colors.surface", c.Surface)
	validateColor("customTheme.appearance.colors.accent", c.Accent)
	validateColor("customTheme.appearance.colors.text", c.Text)
	validateColor("customTheme.appearance.colors.border", c.Border)
	validateColor("customTheme.appearance.colors.interactive", c.Interactive)

	logoURL := strings.TrimSpace(t.Branding.Logo.URL)
	if logoURL == "" {
		add("customTheme.branding.logo.url", "is required")
	} else if err := validateHTTPSOnlyURL(logoURL); err != nil {
		add("customTheme.branding.logo.url", err.Error())
	}

	font := t.Appearance.Font
	switch strings.ToLower(strings.TrimSpace(font.Source)) {
	case "google":
		name := strings.TrimSpace(font.Name)
		if name == "" {
			add("customTheme.appearance.font.name", "is required when source is google")
		} else if googleFonts != nil && !googleFonts.IsValidFont(name) {
			add("customTheme.appearance.font.name", "is not a recognized Google Font")
		}
		if font.KitID != nil && strings.TrimSpace(*font.KitID) != "" {
			add("customTheme.appearance.font.kitId", "must be null when source is google")
		}
	case "typekit":
		if font.KitID == nil || strings.TrimSpace(*font.KitID) == "" {
			add("customTheme.appearance.font.kitId", "is required when source is typekit")
		}
	default:
		add("customTheme.appearance.font.source", "must be google or typekit")
	}

	if font.Size < 10 || font.Size > 32 {
		add("customTheme.appearance.font.size", "must be an integer between 10 and 32")
	}
	if font.LineHeight < 1.0 || font.LineHeight > 3.0 {
		add("customTheme.appearance.font.lineHeight", "must be between 1.0 and 3.0")
	}
	switch strings.ToLower(strings.TrimSpace(font.Display)) {
	case "swap", "block", "fallback", "optional", "auto":
	default:
		add("customTheme.appearance.font.display", "must be swap, block, fallback, optional, or auto")
	}
	if strings.TrimSpace(font.Fallback) == "" {
		add("customTheme.appearance.font.fallback", "is required")
	}

	icons := t.Appearance.Icons
	if strings.ToLower(strings.TrimSpace(icons.Source)) != "iconify" {
		add("customTheme.appearance.icons.source", `must be "iconify"`)
	} else {
		set := strings.TrimSpace(icons.Set)
		if set == "" {
			add("customTheme.appearance.icons.set", "is required")
		} else if iconify != nil && !iconify.IsValidCollection(set) {
			add("customTheme.appearance.icons.set", "is not a valid Iconify collection")
		}
	}

	if len(errs) > 0 {
		return ValidationResult{Errors: errs}
	}
	return ValidationResult{Valid: true, Theme: t}
}

func validateHTTPSOnlyURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return errors.New("must be a valid URL")
	}
	if u.Scheme != "https" {
		return errors.New("must use https:// only")
	}
	if u.Host == "" {
		return errors.New("must include a host")
	}
	return nil
}

// MarshalCustomThemeYAML serializes a theme document for storage.
func MarshalCustomThemeYAML(doc models.CustomThemeDocument) ([]byte, error) {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(doc); err != nil {
		return nil, err
	}
	if err := enc.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// DefaultCustomThemeDocument returns Kurator's default custom theme payload.
func DefaultCustomThemeDocument() models.CustomThemeDocument {
	return models.CustomThemeDocument{
		CustomTheme: models.CustomThemePayload{
			SchemaVersion: models.CustomThemeSchemaVersion,
			Meta: models.CustomThemeMeta{
				Name:        "kurator-default",
				Description: "Default Kurator theme",
				Published:   false,
			},
			Branding: models.CustomThemeBranding{
				Logo: models.CustomThemeLogo{
					URL: "https://assets.kuratorapp.cc/brand/PNG/kurator_favicon-white.png",
				},
			},
			Appearance: models.CustomThemeAppearance{
				Colors: models.CustomThemeColors{
					Primary:     "#000000",
					Secondary:   "#FFFFFF",
					Background:  "#121212",
					Surface:     "#1E1E1E",
					Accent:      "#6200EE",
					Text:        "#FFFFFF",
					Border:      "#333333",
					Interactive: "#BB86FC",
				},
				Font: models.CustomThemeFont{
					Source:     "google",
					Name:       "Inter",
					Size:       16,
					LineHeight: 1.5,
					Display:    "swap",
					Fallback:   "system-ui",
				},
				Icons: models.CustomThemeIcons{
					Source: "iconify",
					Set:    "lucide",
				},
			},
		},
	}
}
