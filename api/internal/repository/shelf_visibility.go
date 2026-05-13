package repository

// OwnedShelfVisibleToViewerSQL returns a SQL predicate that is true when a row whose owner is in
// ownerCol and tri-state visibility is in visibilityCol is visible to a signed-in viewer whose id
// is bound to viewerPlaceholder (e.g. "$1"). Visibility values:
//
//   - "private":   visible only to the owner.
//   - "followers": visible to the owner and to any user who follows the owner. Friends (mutuals) are
//     a subset of followers, so they are included automatically.
//   - "friends":   visible to the owner and to mutual followers (the viewer follows the owner AND
//     the owner follows the viewer back).
//
// ownerCol/visibilityCol are SQL column references (e.g. "l.user_id", "l.visibility").
func OwnedShelfVisibleToViewerSQL(ownerCol, visibilityCol, viewerPlaceholder string) string {
	return "(" + ownerCol + " = " + viewerPlaceholder + " OR (" +
		visibilityCol + " <> 'private' AND EXISTS (SELECT 1 FROM user_follows " +
		"WHERE follower_id = " + viewerPlaceholder + " AND following_id = " + ownerCol + ") AND (" +
		visibilityCol + " = 'followers' OR EXISTS (SELECT 1 FROM user_follows " +
		"WHERE follower_id = " + ownerCol + " AND following_id = " + viewerPlaceholder + "))" +
		"))"
}

// CollectionRowVisibleSQL is true for a collections row c relative to a signed-in viewer whose id
// is bound to viewerPh (e.g. "$2"). Legacy rows with NULL owner stay visible when their visibility
// is anything other than "private" (they have no owner to compare against).
func CollectionRowVisibleSQL(viewerPh string) string {
	return "((c.user_id IS NULL AND c.visibility <> 'private') OR (c.user_id IS NOT NULL AND " +
		OwnedShelfVisibleToViewerOrSharedMemberSQL("c.user_id", "c.visibility", "c.is_shared", "collection", "c.id", viewerPh) + "))"
}

// OwnedShelfVisibleToViewerOrSharedMemberSQL is true when the usual visibility rules apply OR the shelf
// is marked shared and the viewer is an explicit member (see shelf_members).
func OwnedShelfVisibleToViewerOrSharedMemberSQL(ownerCol, visibilityCol, isSharedCol, shelfKind, shelfIDCol, viewerPlaceholder string) string {
	vis := OwnedShelfVisibleToViewerSQL(ownerCol, visibilityCol, viewerPlaceholder)
	mem := "(" + isSharedCol + " = TRUE AND EXISTS (SELECT 1 FROM shelf_members sm WHERE sm.shelf_kind = '" + shelfKind + "' AND sm.shelf_id = " + shelfIDCol + " AND sm.user_id = " + viewerPlaceholder + "))"
	return "(" + vis + " OR " + mem + ")"
}

// CollectionRowVisibleAnonSQL is the visibility predicate for a viewer with no user id.
// Only legacy non–user-owned, non-private collections are reachable without authentication.
func CollectionRowVisibleAnonSQL() string {
	return "(c.user_id IS NULL AND c.visibility <> 'private')"
}
