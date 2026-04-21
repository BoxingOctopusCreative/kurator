package service

// ListMoveTarget is another list the owner may merge item links into before deleting a list.
type ListMoveTarget struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ListDeleteConflict is returned when DELETE /lists/:id is blocked because the list still has item links.
type ListDeleteConflict struct {
	EntryCount          int64            `json:"entry_count"`
	EligibleMoveTargets []ListMoveTarget `json:"eligible_move_targets"`
}

func (e *ListDeleteConflict) Error() string {
	return "list has entries"
}
