package models

import "time"

// BoardVisibility is public (any signed-in user may read and post) or private (invite-only members).
type BoardVisibility string

const (
	BoardVisibilityPublic  BoardVisibility = "public"
	BoardVisibilityPrivate BoardVisibility = "private"
)

func (v BoardVisibility) Valid() bool {
	return v == BoardVisibilityPublic || v == BoardVisibilityPrivate
}

// Board is a discussion forum container.
type Board struct {
	ID          string          `json:"id"`
	OwnerUserID int64           `json:"owner_user_id"`
	Owner       *ShelfAuthor    `json:"owner,omitempty"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Visibility  BoardVisibility `json:"visibility"`
	Slug        string          `json:"slug"`
	BannerURL   *string         `json:"banner_url,omitempty"`
	IconURL     *string         `json:"icon_url,omitempty"`
	ThreadCount int64           `json:"thread_count,omitempty"`
	MemberCount int64           `json:"member_count,omitempty"`
	ViewerRole  string          `json:"viewer_role,omitempty"` // owner | moderator | member | none
	MayManage   bool            `json:"may_manage,omitempty"`
	MayPost     bool            `json:"may_post,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// BoardFlair is a board-defined tag assignable to threads after creation.
type BoardFlair struct {
	ID        string    `json:"id"`
	BoardID   string    `json:"board_id"`
	Label     string    `json:"label"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

// BoardFeedThread is a thread row on the public boards home feed (includes board context).
type BoardFeedThread struct {
	BoardThread
	BoardName    string  `json:"board_name"`
	BoardSlug    string  `json:"board_slug"`
	BoardIconURL *string `json:"board_icon_url,omitempty"`
}

// BoardThread is a top-level discussion post within a board.
type BoardThread struct {
	ID          string       `json:"id"`
	BoardID     string       `json:"board_id"`
	UserID      int64        `json:"user_id"`
	Author      *ShelfAuthor `json:"author,omitempty"`
	Title       string       `json:"title"`
	Body        string       `json:"body"`
	FlairID     *string      `json:"flair_id,omitempty"`
	FlairLabel  *string      `json:"flair_label,omitempty"`
	ReplyCount      int64        `json:"reply_count"`
	IsLocked        bool         `json:"is_locked,omitempty"`
	LockedAt        *time.Time   `json:"locked_at,omitempty"`
	MaySetFlair     bool         `json:"may_set_flair,omitempty"`
	MayDelete       bool         `json:"may_delete,omitempty"`
	MayEdit         bool         `json:"may_edit,omitempty"`
	MayLock         bool         `json:"may_lock,omitempty"`
	MayViewHistory  bool         `json:"may_view_history,omitempty"`
	AuthorTags      []string     `json:"author_tags,omitempty"` // OWNER, MOD, OP
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

// BoardReply is a comment on a thread (optional parent for nesting).
type BoardReply struct {
	ID             string       `json:"id"`
	ThreadID       string       `json:"thread_id"`
	ParentReplyID  *string      `json:"parent_reply_id,omitempty"`
	UserID         int64        `json:"user_id"`
	Author         *ShelfAuthor `json:"author,omitempty"`
	Body           string       `json:"body"`
	MayDelete      bool         `json:"may_delete,omitempty"`
	MayEdit        bool         `json:"may_edit,omitempty"`
	IsEdited       bool         `json:"is_edited,omitempty"`
	AuthorTags     []string     `json:"author_tags,omitempty"` // OWNER, MOD, OP
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
}

// BoardModerator is a user appointed by the board owner to moderate content.
type BoardModerator struct {
	BoardID   string       `json:"board_id"`
	UserID    int64        `json:"user_id"`
	User      *ShelfAuthor `json:"user,omitempty"`
	CreatedAt time.Time    `json:"created_at"`
}

// BoardThreadEdit is a snapshot of thread title/body before an edit.
type BoardThreadEdit struct {
	ID           int64        `json:"id"`
	ThreadID     string       `json:"thread_id"`
	EditorUserID int64        `json:"editor_user_id"`
	Editor       *ShelfAuthor `json:"editor,omitempty"`
	Title        string       `json:"title"`
	Body         string       `json:"body"`
	CreatedAt    time.Time    `json:"created_at"`
}

// BoardReplyEdit is a snapshot of reply body before an edit.
type BoardReplyEdit struct {
	ID           int64        `json:"id"`
	ReplyID      string       `json:"reply_id"`
	EditorUserID int64        `json:"editor_user_id"`
	Editor       *ShelfAuthor `json:"editor,omitempty"`
	Body         string       `json:"body"`
	CreatedAt    time.Time    `json:"created_at"`
}

// BoardInvite is a pending or resolved invitation to a private board.
type BoardInvite struct {
	ID        int64     `json:"id"`
	BoardID   string    `json:"board_id"`
	BoardName string    `json:"board_name,omitempty"`
	InviterID int64     `json:"inviter_id"`
	InviteeID int64     `json:"invitee_id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}
