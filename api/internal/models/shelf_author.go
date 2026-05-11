package models

// ShelfAuthor is a public profile preview for the owner of a user-created shelf.
type ShelfAuthor struct {
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}
