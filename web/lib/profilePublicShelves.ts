import type { Collection, CollectionListResponse, List, Visibility, Wishlist } from "./api";
import { visibilityOf } from "./api";

/** Fields used to decide if a shelf appears on a user’s public profile. */
type ShelfProfileVisibility = {
  visibility?: Visibility | null;
  is_public?: boolean | null;
  is_shared?: boolean | null;
};

/** True when this shelf row is owned by the profile user (excludes other people’s shelves and legacy ownerless rows). */
export function shelfOwnedByProfileUser(
  shelf: { user_id?: number | null },
  profileOwnerUserId: number,
): boolean {
  const uid = shelf.user_id;
  if (uid == null) return false;
  return Number(uid) === profileOwnerUserId;
}

/**
 * Profile shelf filter: owner must match; omit private non-shared; include shared or non-private visibility.
 */
export function shelfIsPublicOnUserProfile(s: ShelfProfileVisibility): boolean {
  if (s.is_shared === true) return true;
  return visibilityOf(s) !== "private";
}

function collectionOnProfile(c: Collection, profileOwnerUserId: number): boolean {
  if (c.user_id == null) return false;
  return Number(c.user_id) === profileOwnerUserId && shelfIsPublicOnUserProfile(c);
}

export function filterCollectionListForUserProfile(
  resp: CollectionListResponse,
  profileOwnerUserId: number,
): CollectionListResponse {
  const items = resp.items.filter((c) => collectionOnProfile(c, profileOwnerUserId));
  return { ...resp, items, total: items.length };
}

export function filterListsForUserProfile(lists: List[], profileOwnerUserId: number): List[] {
  return lists.filter(
    (l) => shelfOwnedByProfileUser(l, profileOwnerUserId) && shelfIsPublicOnUserProfile(l),
  );
}

export function filterWishlistsForUserProfile(wishlists: Wishlist[], profileOwnerUserId: number): Wishlist[] {
  return wishlists.filter(
    (w) => shelfOwnedByProfileUser(w, profileOwnerUserId) && shelfIsPublicOnUserProfile(w),
  );
}
