package models

import (
	"encoding/json"
	"time"
)

// HitlistEntry is one row on a list: either a collection item link or a stub (search / ad-hoc).
type HitlistEntry struct {
	ID          string          `json:"id"`
	ListID      string          `json:"list_id"`
	Item        *Item           `json:"item,omitempty"`
	Stub        *HitlistStub    `json:"stub,omitempty"`
	Description *string         `json:"description,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

// HitlistStub is metadata for a list entry not backed by an item row.
type HitlistStub struct {
	Title    string          `json:"title"`
	Category Category        `json:"category"`
	Metadata json.RawMessage `json:"metadata"`
}
