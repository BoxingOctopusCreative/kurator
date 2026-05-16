package models

import "time"

// ListRef identifies a list for lightweight links (e.g. item page “included in” lists).
type ListRef struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	CoverArtURL *string    `json:"cover_art_url,omitempty"`
	Slug        *string    `json:"slug,omitempty"`
	Visibility  Visibility `json:"visibility"`
}

// List is a user-curated group of existing items (any mix of categories).
type List struct {
	ID          string       `json:"id"`
	UserID      int64        `json:"user_id"`
	Author      *ShelfAuthor `json:"author,omitempty"`
	Name        string       `json:"name"`
	Description *string      `json:"description,omitempty"`
	CoverArtURL *string      `json:"cover_art_url,omitempty"`
	// Slug is the globally unique permalink segment when set (v2 “hitlists”).
	Slug *string `json:"slug,omitempty"`
	// CommentsEnabled is ignored for v1 list endpoints until clients read the field; default true in DB.
	CommentsEnabled bool `json:"comments_enabled"`
	// EntriesNumbered when true shows rank indicators (ordered-style); false is unordered presentation.
	EntriesNumbered bool `json:"entries_numbered"`
	// Visibility is the source of truth: private, followers, friends, or public.
	Visibility Visibility `json:"visibility"`
	// IsPublic is kept for backward compatibility with older clients; derived from Visibility.
	IsPublic  bool      `json:"is_public"`
	IsShared  bool      `json:"is_shared"`
	ItemCount int64     `json:"item_count"`
	// ViewCount is incremented on permalink/detail views (approximate).
	ViewCount int64 `json:"view_count,omitempty"`
	// VoteCount / CommentCount are populated on the discover feed; detail uses VoteStats for vote totals.
	VoteCount    int64 `json:"vote_count,omitempty"`
	CommentCount int64 `json:"comment_count,omitempty"`
	// ViewerHasVoted is set on the discover feed when the caller is authenticated (optional session).
	ViewerHasVoted bool `json:"viewer_has_voted,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
