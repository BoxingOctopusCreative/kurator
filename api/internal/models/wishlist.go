package models

import (
	"encoding/json"
	"time"
)

type Wishlist struct {
	ID                  int64     `json:"id"`
	UserID              int64     `json:"user_id"`
	Name                string    `json:"name"`
	Description         *string   `json:"description,omitempty"`
	TargetCollectionID  *int64    `json:"target_collection_id,omitempty"`
	IsPublic            bool      `json:"is_public"`
	EntryCount          int64     `json:"entry_count"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type WishlistEntry struct {
	ID          int64           `json:"id"`
	WishlistID  int64           `json:"wishlist_id"`
	Title       string          `json:"title"`
	Category    Category        `json:"category"`
	Metadata    json.RawMessage `json:"metadata"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}
