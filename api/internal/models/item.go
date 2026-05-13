package models

import (
	"encoding/json"
	"time"
)

type Category string

const (
	CategoryGame      Category = "game"
	CategoryMusic     Category = "music"
	CategoryBook      Category = "book"
	CategoryMovies    Category = "movies"
	CategoryTV        Category = "tv"
	CategoryAnime     Category = "anime"
	CategoryComicBook Category = "comic_book"
	CategoryManga     Category = "manga"
)

func (c Category) Valid() bool {
	switch c {
	case CategoryGame, CategoryMusic, CategoryBook, CategoryMovies, CategoryTV, CategoryAnime, CategoryComicBook, CategoryManga:
		return true
	default:
		return false
	}
}

// ConsumptionStatus is stored on items; UI wording depends on category (e.g. read/to read for books).
type ConsumptionStatus string

const (
	ConsumptionPending ConsumptionStatus = "pending"
	ConsumptionDone    ConsumptionStatus = "done"
)

func (s ConsumptionStatus) Valid() bool {
	switch s {
	case ConsumptionPending, ConsumptionDone:
		return true
	default:
		return false
	}
}

type Item struct {
	ID           string          `json:"id"`
	CollectionID string          `json:"collection_id"`
	Title        string          `json:"title"`
	Category     Category        `json:"category"`
	Metadata     json.RawMessage `json:"metadata"`
	Rating       *int            `json:"rating,omitempty"`
	// ConsumptionStatus is pending (not yet consumed) or done; omitted in JSON when the column is absent (pre-migration DB).
	ConsumptionStatus ConsumptionStatus `json:"consumption_status,omitempty"`
	CreatedAt         time.Time         `json:"created_at"`
	UpdatedAt         time.Time         `json:"updated_at"`
}

// RatingUpdate describes how to change items.rating on update. Nil means leave the DB value unchanged.
type RatingUpdate struct {
	SetNull bool // true: store NULL (unrated)
	Stars   int  // 1–5 when SetNull is false
}

type Collection struct {
	ID     string `json:"id"`
	UserID *int64 `json:"user_id,omitempty"`
	// Author public preview when UserID is set and the owner exists (nil for legacy unowned catalogs).
	Author      *ShelfAuthor `json:"author,omitempty"`
	Name        string       `json:"name"`
	Description *string      `json:"description,omitempty"`
	// Category pins this shelf to one item type when set; omitted or null means legacy / not yet pinned.
	Category *Category `json:"category,omitempty"`
	// CoverArtURL is an absolute http(s) image URL or same-origin path from image upload.
	CoverArtURL *string `json:"cover_art_url,omitempty"`
	// Visibility is the source of truth for who can see this shelf: private, followers, or friends.
	Visibility Visibility `json:"visibility"`
	// IsPublic is kept for backward compatibility with older clients; derived from Visibility.
	IsPublic  bool      `json:"is_public"`
	// IsShared enables explicit members and join/invite flows (see shelf_members).
	IsShared  bool      `json:"is_shared"`
	ItemCount int64     `json:"item_count"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
