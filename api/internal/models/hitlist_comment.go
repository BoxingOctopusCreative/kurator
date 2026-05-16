package models

import "time"

// HitlistComment is a user comment on a hitlist (authenticated authors only).
type HitlistComment struct {
	ID        string       `json:"id"`
	ListID    string       `json:"list_id"`
	UserID    int64        `json:"user_id"`
	Author    *ShelfAuthor `json:"author,omitempty"`
	Body      string       `json:"body"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
}
