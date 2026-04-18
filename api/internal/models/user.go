package models

import (
	"encoding/json"
	"strings"
	"time"
)

// RedactPublicNames sets pub.FirstName and pub.LastName for API responses.
// When viewerOwnsProfile is true (e.g. /me), legal names are always included.
func RedactPublicNames(pub *PublicUser, firstName, lastName string, firstPublic, lastPublic, viewerOwnsProfile bool) {
	pub.FirstName = ""
	pub.LastName = ""
	if viewerOwnsProfile {
		pub.FirstName = firstName
		pub.LastName = lastName
		return
	}
	if firstPublic {
		pub.FirstName = firstName
	}
	if lastPublic {
		pub.LastName = lastName
	}
}

// PublicLegalLine returns a single-line display of public legal name parts (non-empty segments joined).
func PublicLegalLine(firstName, lastName string) string {
	fn := strings.TrimSpace(firstName)
	ln := strings.TrimSpace(lastName)
	switch {
	case fn != "" && ln != "":
		return fn + " " + ln
	case fn != "":
		return fn
	case ln != "":
		return ln
	default:
		return ""
	}
}

// PublicUser is a safe subset of User for search and profiles (no email).
type PublicUser struct {
	ID          int64           `json:"id"`
	Username    string          `json:"username"`
	DisplayName string          `json:"display_name"`
	FirstName   string          `json:"first_name,omitempty"`
	LastName    string          `json:"last_name,omitempty"`
	Location    string          `json:"location"`
	Bio         string          `json:"bio"`
	AvatarURL   *string         `json:"avatar_url,omitempty"`
	BannerURL   *string         `json:"banner_url,omitempty"`
	SocialLinks json.RawMessage `json:"social_links"`
	CreatedAt   time.Time       `json:"created_at"`
}

// UserProfile extends PublicUser with social stats.
type UserProfile struct {
	PublicUser
	ProfileIsPublic bool  `json:"profile_is_public"`
	FollowerCount   int64 `json:"follower_count"`
	FollowingCount  int64 `json:"following_count"`
	IsFollowing     *bool `json:"is_following,omitempty"`
}

// User is a persisted account (credentials + profile).
type User struct {
	ID                int64           `json:"id"`
	Email             string          `json:"email"`
	PasswordHash      string          `json:"-"`
	Username          string          `json:"username"`
	UsernameLocked    bool            `json:"username_locked"`
	ProfileIsPublic   bool            `json:"profile_is_public"`
	DisplayName       string          `json:"display_name"`
	FirstName         string          `json:"first_name"`
	LastName          string          `json:"last_name"`
	FirstNamePublic   bool            `json:"first_name_public"`
	LastNamePublic    bool            `json:"last_name_public"`
	Location          string          `json:"location"`
	Bio               string          `json:"bio"`
	ThemePreference   string          `json:"theme_preference"`
	AvatarURL         *string         `json:"avatar_url,omitempty"`
	BannerURL         *string         `json:"banner_url,omitempty"`
	SocialLinks       json.RawMessage `json:"social_links"`
	TwoFactorEnabled  bool            `json:"two_factor_enabled"`
	TwoFactorSecret   *string         `json:"-"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}
