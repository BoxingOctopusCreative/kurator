package service

// WishlistMoveTarget is another wishlist the owner may copy entries into before deleting a wishlist.
type WishlistMoveTarget struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// WishlistDeleteConflict is returned when DELETE /wishlists/:id is blocked because entries still exist.
type WishlistDeleteConflict struct {
	EntryCount          int64                `json:"entry_count"`
	EligibleMoveTargets []WishlistMoveTarget `json:"eligible_move_targets"`
}

func (e *WishlistDeleteConflict) Error() string {
	return "wishlist has entries"
}
