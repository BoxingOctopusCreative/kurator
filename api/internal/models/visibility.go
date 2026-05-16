package models

import "strings"

// Visibility controls who can see a user-owned list, collection, or wishlist.
//   - "private":   only the owner.
//   - "followers": the owner plus anyone who follows them (mutual followers — friends — included).
//   - "friends":   the owner plus mutual followers only.
//   - "public":    visible to anyone (including unauthenticated clients), subject to route auth.
type Visibility string

const (
	VisibilityPrivate   Visibility = "private"
	VisibilityFollowers Visibility = "followers"
	VisibilityFriends   Visibility = "friends"
	VisibilityPublic    Visibility = "public"
)

// DefaultVisibility is used when a client creates a shelf without specifying visibility.
// "followers" preserves the prior "is_public = true" default while requiring a follow edge.
const DefaultVisibility Visibility = VisibilityFollowers

// Valid reports whether v is one of the recognized visibility values.
func (v Visibility) Valid() bool {
	switch v {
	case VisibilityPrivate, VisibilityFollowers, VisibilityFriends, VisibilityPublic:
		return true
	default:
		return false
	}
}

// IsPublic reports whether the value allows anyone other than the owner. Used for the legacy
// is_public boolean kept in API responses for backward compatibility.
func (v Visibility) IsPublic() bool {
	return v == VisibilityFollowers || v == VisibilityFriends || v == VisibilityPublic
}

// ParseVisibility normalizes user input. Empty input returns ("", true) so callers can decide
// whether to apply a default; invalid input returns false.
func ParseVisibility(s string) (Visibility, bool) {
	t := Visibility(strings.ToLower(strings.TrimSpace(s)))
	if t == "" {
		return "", true
	}
	if t.Valid() {
		return t, true
	}
	return "", false
}

// VisibilityFromIsPublic maps the legacy boolean to a tri-state value:
// true → followers (the prior public default), false → private.
func VisibilityFromIsPublic(isPublic bool) Visibility {
	if isPublic {
		return VisibilityFollowers
	}
	return VisibilityPrivate
}
