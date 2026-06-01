package models

import (
	"time"

	"github.com/google/uuid"
)

const CustomThemeSchemaVersion = "v1"

// CustomThemeDocument is the top-level YAML envelope.
type CustomThemeDocument struct {
	CustomTheme CustomThemePayload `yaml:"customTheme" json:"customTheme"`
}

// CustomThemePayload is the user-facing theme definition (author omitted on input).
type CustomThemePayload struct {
	SchemaVersion string              `yaml:"schemaVersion" json:"schemaVersion"`
	Meta          CustomThemeMeta     `yaml:"meta" json:"meta"`
	Branding      CustomThemeBranding `yaml:"branding" json:"branding"`
	Appearance    CustomThemeAppearance `yaml:"appearance" json:"appearance"`
}

type CustomThemeMeta struct {
	Name        string `yaml:"name" json:"name"`
	Description string `yaml:"description" json:"description"`
	Published   bool   `yaml:"published" json:"published"`
}

type CustomThemeAuthor struct {
	KuratorUserID *int64  `yaml:"kuratorUserId" json:"kuratorUserId"`
	DisplayName   *string `yaml:"displayName" json:"displayName"`
	ProfileURL    *string `yaml:"profileUrl" json:"profileUrl"`
}

type CustomThemeMetaPublished struct {
	Name        string            `yaml:"name" json:"name"`
	Description string            `yaml:"description" json:"description"`
	Published   bool              `yaml:"published" json:"published"`
	Author      CustomThemeAuthor `yaml:"author" json:"author"`
}

type CustomThemeBranding struct {
	Logo CustomThemeLogo `yaml:"logo" json:"logo"`
}

type CustomThemeLogo struct {
	URL string `yaml:"url" json:"url"`
}

type CustomThemeAppearance struct {
	Colors CustomThemeColors `yaml:"colors" json:"colors"`
	Font   CustomThemeFont   `yaml:"font" json:"font"`
	Icons  CustomThemeIcons  `yaml:"icons" json:"icons"`
}

type CustomThemeColors struct {
	Primary     string `yaml:"primary" json:"primary"`
	Secondary   string `yaml:"secondary" json:"secondary"`
	Background  string `yaml:"background" json:"background"`
	Surface     string `yaml:"surface" json:"surface"`
	Accent      string `yaml:"accent" json:"accent"`
	Text        string `yaml:"text" json:"text"`
	Border      string `yaml:"border" json:"border"`
	Interactive string `yaml:"interactive" json:"interactive"`
}

type CustomThemeFont struct {
	Source     string  `yaml:"source" json:"source"`
	Name       string  `yaml:"name" json:"name"`
	KitID      *string `yaml:"kitId" json:"kitId"`
	Size       int     `yaml:"size" json:"size"`
	LineHeight float64 `yaml:"lineHeight" json:"lineHeight"`
	Display    string  `yaml:"display" json:"display"`
	Fallback   string  `yaml:"fallback" json:"fallback"`
}

type CustomThemeIcons struct {
	Source string `yaml:"source" json:"source"`
	Set    string `yaml:"set" json:"set"`
}

type UserCustomTheme struct {
	UserID      int64     `json:"user_id"`
	ThemeID     uuid.UUID `json:"theme_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	S3Key       string    `json:"-"`
	YAML        string    `json:"yaml,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CustomThemeLibraryEntry struct {
	ID          uuid.UUID `json:"id"`
	UserID      int64     `json:"user_id"`
	Source      string    `json:"source"`
	RefID       uuid.UUID `json:"ref_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	S3Key       string    `json:"-"`
	YAML        string    `json:"yaml,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type PublishedCustomTheme struct {
	ID                uuid.UUID  `json:"id"`
	ThemeFamilyID     uuid.UUID  `json:"theme_family_id"`
	Version           int        `json:"version"`
	AuthorUserID      *int64     `json:"author_user_id,omitempty"`
	AuthorDisplayName string     `json:"author_display_name"`
	AuthorProfileURL  *string    `json:"author_profile_url,omitempty"`
	AuthorDeleted     bool       `json:"author_deleted"`
	Name              string     `json:"name"`
	Description       string     `json:"description"`
	S3Key             string     `json:"-"`
	YAML              string     `json:"yaml,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}
