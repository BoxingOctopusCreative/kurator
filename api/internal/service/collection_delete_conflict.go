package service

// CollectionMoveTarget is another shelf the owner may move items into before deleting a collection.
type CollectionMoveTarget struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Category *string `json:"category,omitempty"`
}

// CollectionDeleteConflict is returned when DELETE /collections/:id is blocked because the shelf still has items.
type CollectionDeleteConflict struct {
	ItemCount           int64                  `json:"item_count"`
	EligibleMoveTargets []CollectionMoveTarget `json:"eligible_move_targets"`
}

func (e *CollectionDeleteConflict) Error() string {
	return "collection has items"
}
