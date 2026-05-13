package models

import "time"

// DashboardShelf is a unified shape used by the dashboard "recent shelves" feed which
// mixes collections, lists, and wishlists ordered by updated_at. Per-kind fields are
// only populated for the matching kind: Category and ItemCount apply to collections,
// ItemCount applies to lists, EntryCount applies to wishlists.
type DashboardShelf struct {
	Kind        string       `json:"kind"`
	ID          string       `json:"id"`
	UserID      int64        `json:"user_id"`
	Author      *ShelfAuthor `json:"author,omitempty"`
	Name        string       `json:"name"`
	Description *string      `json:"description,omitempty"`
	CoverArtURL *string      `json:"cover_art_url,omitempty"`
	Category    *Category    `json:"category,omitempty"`
	Visibility  Visibility   `json:"visibility"`
	IsPublic    bool         `json:"is_public"`
	IsShared    bool         `json:"is_shared"`
	ItemCount   int64        `json:"item_count"`
	EntryCount  int64        `json:"entry_count"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}
