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
	CategoryVideo     Category = "video"
	CategoryComicBook Category = "comic_book"
	CategoryManga     Category = "manga"
)

func (c Category) Valid() bool {
	switch c {
	case CategoryGame, CategoryMusic, CategoryBook, CategoryVideo, CategoryComicBook, CategoryManga:
		return true
	default:
		return false
	}
}

type Item struct {
	ID           int64           `json:"id"`
	CollectionID int64           `json:"collection_id"`
	Title        string          `json:"title"`
	Category     Category        `json:"category"`
	Metadata     json.RawMessage `json:"metadata"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

type Collection struct {
	ID          int64     `json:"id"`
	UserID      *int64    `json:"user_id,omitempty"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	IsPublic    bool      `json:"is_public"`
	ItemCount   int64     `json:"item_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
