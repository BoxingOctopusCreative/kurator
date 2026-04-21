package models

import (
	"encoding/json"
	"time"
)

type Wishlist struct {
	ID                 string    `json:"id"`
	UserID             int64     `json:"user_id"`
	Name               string    `json:"name"`
	Description        *string   `json:"description,omitempty"`
	CoverArtURL        *string   `json:"cover_art_url,omitempty"`
	TargetCollectionID *string   `json:"target_collection_id,omitempty"`
	IsPublic           bool      `json:"is_public"`
	EntryCount         int64     `json:"entry_count"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type WishlistEntry struct {
	ID          string          `json:"id"`
	WishlistID  string          `json:"wishlist_id"`
	Title       string          `json:"title"`
	Category    Category        `json:"category"`
	Metadata    json.RawMessage `json:"metadata"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}
