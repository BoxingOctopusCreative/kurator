package models

import "time"

// SharedShelfForDeletion describes a shared shelf the user owns, with members eligible for ownership transfer.
type SharedShelfForDeletion struct {
	Kind    string                    `json:"kind"`
	ID      string                    `json:"id"`
	Name    string                    `json:"name"`
	Members []SharedShelfMemberOption `json:"members"`
}

type SharedShelfMemberOption struct {
	UserID      int64  `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

// ShelfOwnershipTransfer is a voluntary transfer during account deletion.
type ShelfOwnershipTransfer struct {
	Kind       string `json:"kind"`
	ShelfID    string `json:"shelf_id"`
	NewOwnerID int64  `json:"new_owner_id"`
}

// ShelfOwnershipSuccession is exposed for election/takeover UIs.
type ShelfOwnershipSuccession struct {
	ID              int64     `json:"id"`
	ShelfKind       string    `json:"shelf_kind"`
	ShelfID         string    `json:"shelf_id"`
	ShelfName       string    `json:"shelf_name"`
	Mode            string    `json:"mode"`
	Status          string    `json:"status"`
	OutgoingOwnerID int64     `json:"outgoing_owner_id"`
	CreatedAt       time.Time `json:"created_at"`
}
