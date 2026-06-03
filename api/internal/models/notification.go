package models

import (
	"encoding/json"
	"time"
)

// Activity notification kinds (stored in notifications.kind).
const (
	NotificationKindCollectionCreated = "collection_created"
	NotificationKindListCreated       = "list_created"
	NotificationKindWishlistCreated   = "wishlist_created"
	NotificationKindItemAdded         = "item_added"
	NotificationKindItemRated         = "item_rated"
	NotificationKindNewFollower       = "new_follower"
	NotificationKindShelfAccessRequest      = "shelf_access_request"
	NotificationKindShelfOwnershipTakeover    = "shelf_ownership_takeover"
	NotificationKindShelfOwnershipElection  = "shelf_ownership_election"
	NotificationKindCustomThemeUnpublished    = "custom_theme_unpublished"
	NotificationKindBoardInvite        = "board_invite"
	NotificationKindBoardThreadReply   = "board_thread_reply"
	NotificationKindBoardReplyReply    = "board_reply_reply"
)

// NotificationFeedItem is one row for GET /me/notifications.
type NotificationFeedItem struct {
	ID        int64           `json:"id"`
	Actor     PublicUser      `json:"actor"`
	Kind      string          `json:"kind"`
	Payload   json.RawMessage `json:"payload"`
	Read      bool            `json:"read"`
	CreatedAt time.Time       `json:"created_at"`
}
