package models

import "time"

// ListRef identifies a list for lightweight links (e.g. item page “included in” lists).
type ListRef struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	CoverArtURL *string `json:"cover_art_url,omitempty"`
}

// List is a user-curated group of existing items (any mix of categories).
type List struct {
	ID          string    `json:"id"`
	UserID      int64     `json:"user_id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CoverArtURL *string   `json:"cover_art_url,omitempty"`
	IsPublic    bool      `json:"is_public"`
	ItemCount   int64     `json:"item_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
