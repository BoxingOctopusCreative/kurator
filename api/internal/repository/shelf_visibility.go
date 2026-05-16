package repository

// OwnedShelfVisibleToViewerSQL returns a SQL predicate that is true when a row whose owner is in
// ownerCol and tri-state visibility is in visibilityCol is visible to a signed-in viewer whose id
// is bound to viewerPlaceholder (e.g. "$1"). Visibility values:
//
//   - "private":   visible only to the owner.
//   - "followers": visible to the owner and to any user who follows the owner. Friends (mutuals) are
//     a subset of followers, so they are included automatically.
//   - "public":    visible to signed-in viewers without a follow (and to anonymous routes that
//     check visibility = 'public' explicitly).
//
// ownerCol/visibilityCol are SQL column references (e.g. "l.user_id", "l.visibility").
func OwnedShelfVisibleToViewerSQL(ownerCol, visibilityCol, viewerPlaceholder string) string {
	// Owner always; internet-public; followers with follow edge; friends = mutual follows.
	return "(" + ownerCol + " = " + viewerPlaceholder +
		" OR " + visibilityCol + " = 'public'" +
		" OR (" + visibilityCol + " = 'followers' AND EXISTS (SELECT 1 FROM user_follows WHERE follower_id = " + viewerPlaceholder + " AND following_id = " + ownerCol + "))" +
		" OR (" + visibilityCol + " = 'friends' AND EXISTS (SELECT 1 FROM user_follows WHERE follower_id = " + viewerPlaceholder + " AND following_id = " + ownerCol + ") AND EXISTS (SELECT 1 FROM user_follows WHERE follower_id = " + ownerCol + " AND following_id = " + viewerPlaceholder + "))" +
		")"
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
// Legacy non–user-owned, non-private catalogs remain reachable; user-owned collections are
// visible when marked public (internet).
func CollectionRowVisibleAnonSQL() string {
	return "((c.user_id IS NULL AND c.visibility <> 'private') OR (c.user_id IS NOT NULL AND c.visibility = 'public'))"
}

// LooseItemVisibleViaListSQL is true when an item (expression for items.id, e.g. "i.id") appears on
// at least one list the signed-in viewer may see (viewer id = viewerPlaceholder e.g. "$2").
// Applies to both loose items and shelved items (e.g. collection hitlist picks).
func LooseItemVisibleViaListSQL(itemIDExpr, viewerPlaceholder string) string {
	vis := OwnedShelfVisibleToViewerOrSharedMemberSQL("l.user_id", "l.visibility", "l.is_shared", "list", "l.id", viewerPlaceholder)
	return "(EXISTS (SELECT 1 FROM list_entries le INNER JOIN lists l ON l.id = le.list_id WHERE le.item_id = " + itemIDExpr +
		" AND le.item_id IS NOT NULL AND " + vis + "))"
}

// LooseItemVisibleViaListAnonSQL is the anonymous viewer variant (public lists only).
// Applies to both loose items and shelved items linked from a public list row.
func LooseItemVisibleViaListAnonSQL(itemIDExpr string) string {
	return "(EXISTS (SELECT 1 FROM list_entries le INNER JOIN lists l ON l.id = le.list_id WHERE le.item_id = " + itemIDExpr +
		" AND le.item_id IS NOT NULL AND l.visibility = 'public'))"
}
