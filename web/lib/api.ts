import { apiUrl } from "./apiUrl";
import type { SocialLinkInput } from "./validation";

export type Category =
  | "game"
  | "music"
  | "book"
  | "movies"
  | "tv"
  | "anime"
  | "comic_book"
  | "manga";

/** Whether the item is still queued vs finished for its category (wording depends on category). */
export type ConsumptionStatus = "pending" | "done";

/** Tri-state visibility for user-owned shelves (lists, collections, wishlists). */
export type Visibility = "private" | "followers" | "friends";

/** Default selected visibility used when the user hasn't picked one yet. */
export const DEFAULT_VISIBILITY: Visibility = "followers";

/** Reads visibility from an API payload. Older servers only return is_public; map it accordingly. */
export function visibilityOf(value: {
  visibility?: Visibility | null;
  is_public?: boolean | null;
}): Visibility {
  if (value.visibility === "private" || value.visibility === "followers" || value.visibility === "friends") {
    return value.visibility;
  }
  return value.is_public === false ? "private" : "followers";
}

/** Short user-facing label for a visibility value. */
export function visibilityLabel(v: Visibility): string {
  switch (v) {
    case "private":
      return "Private";
    case "followers":
      return "Followers";
    case "friends":
      return "Friends";
  }
}

export type Item = {
  id: string;
  collection_id: string;
  title: string;
  category: Category;
  metadata: Record<string, unknown>;
  /** 1–5 stars, or null/omitted when not rated. */
  rating?: number | null;
  /** Omitted on older API databases; treat missing as `"pending"`. */
  consumption_status?: ConsumptionStatus;
  created_at: string;
  updated_at: string;
};

/** Public owner preview on user-owned shelves (from API `author`). */
export type ShelfAuthor = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type Collection = {
  id: string;
  user_id?: number | null;
  /** Present when the shelf has a user owner; omitted on legacy catalog rows. */
  author?: ShelfAuthor | null;
  name: string;
  description?: string | null;
  /** When set, items on this shelf must use this category. */
  category?: Category | null;
  /** Absolute image URL or same-origin path from upload. */
  cover_art_url?: string | null;
  /** Tri-state visibility (source of truth on newer API builds). */
  visibility?: Visibility;
  /** Legacy boolean kept for older clients; prefer `visibility`. */
  is_public: boolean;
  /** When true, others can request membership or accept invites (see shelf sharing). */
  is_shared?: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type CollectionListResponse = {
  items: Collection[];
  total: number;
  page: number;
  page_size: number;
};

function itemsListHttpError(res: Response): Error {
  if (res.status >= 500) {
    return new Error(
      "Could not load items (server error). If you run the API yourself, apply the latest database migrations and restart.",
    );
  }
  return new Error(`Could not load items (${res.status}).`);
}

export async function fetchLatestItems(limit = 24): Promise<Item[]> {
  const res = await fetch(apiUrl(`/items?limit=${limit}`), {
    cache: "no-store",
  });
  if (!res.ok) throw itemsListHttpError(res);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchItems(opts?: {
  limit?: number;
  collectionId?: string;
  /** When loading a collection: filter by consumption (server-side when supported). */
  consumptionStatus?: ConsumptionStatus | "all";
  /** Requires login. Ignored when collectionId is set. */
  scope?: "mine" | "following";
}): Promise<Item[]> {
  const sp = new URLSearchParams({ limit: String(opts?.limit ?? 48) });
  if (opts?.collectionId != null)
    sp.set("collection_id", String(opts.collectionId));
  if (
    opts?.consumptionStatus &&
    opts?.consumptionStatus !== "all" &&
    opts.collectionId != null
  ) {
    sp.set("consumption_status", opts.consumptionStatus);
  }
  if (opts?.scope && opts.collectionId == null) sp.set("scope", opts.scope);
  const res = await fetch(apiUrl(`/items?${sp}`), {
    credentials: "include",
  });
  if (!res.ok) throw itemsListHttpError(res);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchItem(id: string): Promise<Item> {
  const res = await fetch(apiUrl(`/items/${id}`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("Item not found.");
  if (!res.ok) throw new Error(`item: ${res.status}`);
  return res.json() as Promise<Item>;
}

/** Lists visible to the viewer that include this item (same visibility as the item itself). */
export type ItemListRef = {
  id: string;
  name: string;
  cover_art_url?: string | null;
};

export async function fetchItemLists(id: string): Promise<ItemListRef[]> {
  const res = await fetch(apiUrl(`/items/${id}/lists`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("Item not found.");
  if (!res.ok) throw new Error(`item lists: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as ItemListRef[]) : [];
}

export type ItemEnrichment = {
  synopsis?: string;
  source?: string;
  source_url?: string;
  note?: string;
};

/** Plot or summary text when available for this item. */
export async function fetchItemEnrichment(id: string): Promise<ItemEnrichment> {
  const res = await fetch(apiUrl(`/items/${id}/enrichment`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("Item not found.");
  if (!res.ok) throw new Error(`enrichment: ${res.status}`);
  return res.json() as Promise<ItemEnrichment>;
}

export async function fetchCollections(params: {
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  has_description?: "" | "yes" | "no";
  /** "following" lists public collections from people you follow (requires login). */
  scope?: "" | "all" | "following";
  owner_user_id?: number;
}): Promise<CollectionListResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.sort) sp.set("sort", params.sort);
  if (params.has_description) sp.set("has_description", params.has_description);
  if (params.scope && params.scope !== "all") sp.set("scope", params.scope);
  if (params.owner_user_id != null && params.owner_user_id > 0) {
    sp.set("owner_user_id", String(params.owner_user_id));
  }
  const res = await fetch(apiUrl(`/collections?${sp}`), {
    credentials: "include",
  });
  if (res.status === 401 && params.scope === "following") {
    throw new Error("Sign in to see collections from people you follow.");
  }
  if (!res.ok) throw new Error(`collections: ${res.status}`);
  const data = (await res.json()) as CollectionListResponse;
  if (!data.items) {
    return { ...data, items: [] };
  }
  return data;
}

export async function fetchCollection(id: string): Promise<Collection> {
  const res = await fetch(apiUrl(`/collections/${id}`), {
    credentials: "include",
  });
  if (res.status === 404) throw new Error("Collection not found.");
  if (!res.ok) throw new Error(`collection: ${res.status}`);
  return res.json();
}

export async function createCollection(body: {
  name: string;
  description?: string;
  /** Tri-state visibility selector. Falls back to is_public on older API builds. */
  visibility?: Visibility;
  is_public?: boolean;
  /** Pins the new shelf to one item type; omit for a flex shelf until the first item pins it. */
  category?: Category;
  is_shared?: boolean;
  invite_user_ids?: number[];
}): Promise<Collection> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
  };
  if (body.visibility !== undefined) payload.visibility = body.visibility;
  if (body.is_public !== undefined) payload.is_public = body.is_public;
  if (body.category !== undefined) payload.category = body.category;
  if (body.is_shared === true) payload.is_shared = true;
  if (body.invite_user_ids != null && body.invite_user_ids.length > 0) {
    payload.invite_user_ids = body.invite_user_ids;
  }
  const res = await fetch(apiUrl("/collections"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new Error("Sign in to create a collection.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `create collection: ${res.status}`);
  }
  return res.json();
}

export async function patchCollection(
  id: string,
  body: {
    name?: string;
    description?: string;
    visibility?: Visibility;
    is_public?: boolean;
    cover_art_url?: string;
    /** When set, updates whether the collection is a shared shelf (owner only). */
    is_shared?: boolean;
    /** Sends invite notifications to mutual friends; shelf must already be shared (or set `is_shared` in the same request). */
    invite_user_ids?: number[];
  },
): Promise<Collection> {
  const payload: Record<string, unknown> = {};
  if (body.name !== undefined) payload.name = body.name;
  if (body.description !== undefined) payload.description = body.description;
  if (body.visibility !== undefined) payload.visibility = body.visibility;
  if (body.is_public !== undefined) payload.is_public = body.is_public;
  if (body.cover_art_url !== undefined) payload.cover_art_url = body.cover_art_url;
  if (body.is_shared !== undefined) payload.is_shared = body.is_shared;
  if (body.invite_user_ids != null && body.invite_user_ids.length > 0) {
    payload.invite_user_ids = body.invite_user_ids;
  }
  const res = await fetch(apiUrl(`/collections/${id}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new Error("Sign in to edit this collection.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `update collection: ${res.status}`);
  }
  return res.json();
}

export type CollectionDeleteMoveTarget = {
  id: string;
  name: string;
  category?: Category;
};

export type CollectionDeleteConflictPayload = {
  item_count: number;
  eligible_move_targets: CollectionDeleteMoveTarget[];
};

export type DeleteCollectionOutcome =
  | { ok: true }
  | { ok: false; conflict: CollectionDeleteConflictPayload }
  | { ok: false; message: string };

/** Delete a collection you own. Call with no options first when the shelf may have items: a 409 returns eligible shelves to move into. */
export async function deleteCollection(
  id: string,
  opts?: { move_items_to?: string; delete_items?: boolean },
): Promise<DeleteCollectionOutcome> {
  const body: Record<string, unknown> = {};
  if (opts?.move_items_to) body.move_items_to = opts.move_items_to;
  if (opts?.delete_items) body.delete_items = true;
  const res = await fetch(apiUrl(`/collections/${id}`), {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return { ok: true };
  if (res.status === 401) {
    return { ok: false, message: "Sign in to delete a collection." };
  }
  if (res.status === 409) {
    const j = (await res.json()) as {
      item_count?: number;
      eligible_move_targets?: CollectionDeleteMoveTarget[];
    };
    return {
      ok: false,
      conflict: {
        item_count: Number(j.item_count ?? 0),
        eligible_move_targets: Array.isArray(j.eligible_move_targets)
          ? j.eligible_move_targets
          : [],
      },
    };
  }
  const t = await res.text();
  return { ok: false, message: t || `delete collection: ${res.status}` };
}

/** CSV columns: id, title, category, metadata (JSON), optional rating, optional consumption_status. Owner-only. */
export async function exportCollectionItemsCsv(
  collectionId: string,
): Promise<Blob> {
  const res = await fetch(apiUrl(`/collections/${collectionId}/items.csv`), {
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in to export.");
  if (res.status === 403)
    throw new Error("Only the collection owner can export items.");
  if (!res.ok) throw new Error(`export: ${res.status}`);
  return res.blob();
}

export type ImportItemsResult = {
  created: number;
  updated: number;
  errors?: { row: number; error: string }[];
};

export async function importCollectionItemsCsv(
  collectionId: string,
  file: File,
): Promise<ImportItemsResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl(`/collections/${collectionId}/items/import`), {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (res.status === 401) throw new Error("Sign in to import.");
  if (res.status === 403)
    throw new Error("Only the collection owner can import items.");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `import: ${res.status}`);
  }
  return res.json() as Promise<ImportItemsResult>;
}

export type PublicUser = {
  id: number;
  username: string;
  display_name: string;
  /** Present when the owner marked first name as public (or you are viewing your own account via /me). */
  first_name?: string;
  /** Present when the owner marked last name as public (or you are viewing your own account via /me). */
  last_name?: string;
  location: string;
  bio: string;
  avatar_url: string | null;
  banner_url?: string | null;
  social_links: SocialLinkInput[];
  created_at: string;
};

/** Non-empty legal name line from public first/last fields (API omits private parts). */
export function publicLegalNameLine(
  u: Pick<PublicUser, "first_name" | "last_name">,
): string | null {
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  if (fn && ln) return `${fn} ${ln}`;
  if (fn) return fn;
  if (ln) return ln;
  return null;
}

export type UserProfile = PublicUser & {
  profile_is_public: boolean;
  follower_count: number;
  following_count: number;
  is_following?: boolean;
};

export type UserListResponse = {
  items: PublicUser[];
  total: number;
  page: number;
  page_size: number;
};

/** In-app activity notification (new followers, follow-graph fan-out + shelf visibility). */
export type NotificationFeedItem = {
  id: number;
  actor: PublicUser;
  kind: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export type NotificationsListResponse = {
  notifications: NotificationFeedItem[];
  unread_count: number;
};

/** Unread badge only; avoids loading notification rows. */
export async function fetchNotificationUnreadCount(): Promise<number> {
  const res = await fetch(apiUrl("/me/notifications/unread-count"), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Sign in to view notifications.");
  if (!res.ok) throw new Error(`notifications: ${res.status}`);
  const data = (await res.json()) as { unread_count?: unknown };
  const n = data.unread_count;
  if (typeof n === "number" && Number.isFinite(n)) {
    return Math.max(0, Math.trunc(n));
  }
  return 0;
}

export async function fetchNotifications(opts?: {
  limit?: number;
  offset?: number;
}): Promise<NotificationsListResponse> {
  const sp = new URLSearchParams();
  if (opts?.limit != null) sp.set("limit", String(opts.limit));
  if (opts?.offset != null) sp.set("offset", String(opts.offset));
  const q = sp.toString();
  const res = await fetch(apiUrl(`/me/notifications${q ? `?${q}` : ""}`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Sign in to view notifications.");
  if (!res.ok) throw new Error(`notifications: ${res.status}`);
  const data = (await res.json()) as NotificationsListResponse;
  if (!Array.isArray(data.notifications)) {
    return { notifications: [], unread_count: data.unread_count ?? 0 };
  }
  return data;
}

export async function markNotificationRead(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/me/notifications/${id}/read`), {
    method: "PATCH",
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in.");
  if (!res.ok) throw new Error(`notifications: ${res.status}`);
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(apiUrl("/me/notifications/read-all"), {
    method: "POST",
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in.");
  if (!res.ok) throw new Error(`notifications: ${res.status}`);
}

export type ShelfKind = "collection" | "list" | "wishlist";

/** Unified shelf shape returned by the dashboard "recent shelves" feed. */
export type DashboardShelf = {
  kind: ShelfKind;
  id: string;
  user_id: number;
  author?: ShelfAuthor | null;
  name: string;
  description?: string | null;
  cover_art_url?: string | null;
  /** Only populated for collections that have been pinned to one item type. */
  category?: Category | null;
  visibility: Visibility;
  is_public: boolean;
  is_shared: boolean;
  /** Counts items (for collections/lists) or wishlist entries (for wishlists). */
  item_count: number;
  entry_count: number;
  created_at: string;
  updated_at: string;
};

/** Recent shelves for the signed-in user's dashboard. */
export async function fetchRecentShelves(opts: {
  scope: "mine" | "following";
  /** Omit for a mix of all three shelf kinds. */
  kind?: ShelfKind;
  limit?: number;
}): Promise<DashboardShelf[]> {
  const sp = new URLSearchParams({ scope: opts.scope });
  if (opts.kind) sp.set("kind", opts.kind);
  if (opts.limit != null && opts.limit > 0) sp.set("limit", String(opts.limit));
  const res = await fetch(apiUrl(`/me/shelves?${sp}`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Sign in to see your dashboard.");
  if (!res.ok) throw new Error(`dashboard shelves: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as DashboardShelf[]) : [];
}

export async function requestShelfJoin(body: {
  shelf_kind: ShelfKind;
  shelf_id: string;
}): Promise<void> {
  const res = await fetch(apiUrl("/me/shelf-share/join"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("Sign in to request access.");
  if (res.status === 204) return;
  const t = await res.text();
  throw new Error(t || `join request: ${res.status}`);
}

export async function inviteToShelf(body: {
  shelf_kind: ShelfKind;
  shelf_id: string;
  invite_user_ids: number[];
}): Promise<void> {
  const res = await fetch(apiUrl("/me/shelf-share/invite"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("Sign in to send invites.");
  if (res.status === 204) return;
  const t = await res.text();
  throw new Error(t || `invite: ${res.status}`);
}

export async function approveShelfAccessRequest(requestId: number): Promise<void> {
  const res = await fetch(apiUrl(`/me/shelf-access-requests/${requestId}/approve`), {
    method: "POST",
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in.");
  if (res.status === 204) return;
  const t = await res.text();
  throw new Error(t || `approve: ${res.status}`);
}

export async function dismissShelfAccessRequest(requestId: number): Promise<void> {
  const res = await fetch(apiUrl(`/me/shelf-access-requests/${requestId}/dismiss`), {
    method: "POST",
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in.");
  if (res.status === 204) return;
  const t = await res.text();
  throw new Error(t || `dismiss: ${res.status}`);
}

export async function searchUsers(q: string): Promise<PublicUser[]> {
  const sp = new URLSearchParams({ q: q.trim() });
  const res = await fetch(apiUrl(`/users/search?${sp}`), {
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in to search for people.");
  if (!res.ok) throw new Error(`user search: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchUserProfile(userRef: string): Promise<UserProfile> {
  const enc = encodeURIComponent(userRef.trim());
  const res = await fetch(apiUrl(`/users/${enc}`), { credentials: "include" });
  if (res.status === 404) throw new Error("User not found.");
  if (!res.ok) throw new Error(`profile: ${res.status}`);
  return res.json();
}

/** Fetch a user profile without requiring a session (public profiles only; private returns null). */
export async function fetchPublicUserProfile(
  userRef: string,
): Promise<UserProfile | null> {
  const enc = encodeURIComponent(userRef.trim());
  const res = await fetch(apiUrl(`/users/${enc}`), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`profile: ${res.status}`);
  return res.json() as Promise<UserProfile>;
}

/**
 * Collections owned by `ownerUserId` that the current viewer may see (visibility, mutuals, shared membership).
 * - Browser: uses `credentials: "include"` so the session cookie reaches the API via the app origin.
 * - Server: pass `cookieHeader` from `cookies()` so the same visibility rules apply during SSR.
 * Unsigned viewers only match legacy non–user-owned shelves, so user profiles typically show shelves only when signed in.
 */
export async function fetchProfileOwnerCollections(
  ownerUserId: number,
  opts?: { cookieHeader?: string },
): Promise<CollectionListResponse> {
  const sp = new URLSearchParams({
    owner_user_id: String(ownerUserId),
    limit: "48",
    sort: "updated_desc",
  });
  const isServer = typeof window === "undefined";
  const init: RequestInit = { cache: "no-store" };
  if (opts?.cookieHeader) {
    init.headers = { Cookie: opts.cookieHeader };
  } else if (!isServer) {
    init.credentials = "include";
  }
  const res = await fetch(apiUrl(`/collections?${sp}`), init);
  if (!res.ok) {
    return { items: [], total: 0, page: 1, page_size: 48 };
  }
  const data = (await res.json()) as CollectionListResponse;
  if (!data.items) {
    return { ...data, items: [] };
  }
  return data;
}

/**
 * Lists owned by `ownerUserId` that the viewer may see (visibility / follow rules), same as collections profile query.
 */
export async function fetchProfileOwnerLists(
  ownerUserId: number,
  opts?: { cookieHeader?: string },
): Promise<List[]> {
  const sp = new URLSearchParams({ owner_user_id: String(ownerUserId) });
  const isServer = typeof window === "undefined";
  const init: RequestInit = { cache: "no-store" };
  if (opts?.cookieHeader) {
    init.headers = { Cookie: opts.cookieHeader };
  } else if (!isServer) {
    init.credentials = "include";
  }
  const res = await fetch(apiUrl(`/lists?${sp}`), init);
  if (!res.ok) {
    return [];
  }
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as List[]) : [];
}

/**
 * Wishlists owned by `ownerUserId` that the viewer may see (visibility / follow rules).
 */
export async function fetchProfileOwnerWishlists(
  ownerUserId: number,
  opts?: { cookieHeader?: string },
): Promise<Wishlist[]> {
  const sp = new URLSearchParams({ owner_user_id: String(ownerUserId) });
  const isServer = typeof window === "undefined";
  const init: RequestInit = { cache: "no-store" };
  if (opts?.cookieHeader) {
    init.headers = { Cookie: opts.cookieHeader };
  } else if (!isServer) {
    init.credentials = "include";
  }
  const res = await fetch(apiUrl(`/wishlists?${sp}`), init);
  if (!res.ok) {
    return [];
  }
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as Wishlist[]) : [];
}

export async function followUser(userRef: string): Promise<void> {
  const enc = encodeURIComponent(userRef.trim());
  const res = await fetch(apiUrl(`/users/${enc}/follow`), {
    method: "POST",
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in to follow.");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `follow: ${res.status}`);
  }
}

export async function unfollowUser(userRef: string): Promise<void> {
  const enc = encodeURIComponent(userRef.trim());
  const res = await fetch(apiUrl(`/users/${enc}/follow`), {
    method: "DELETE",
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in.");
  if (!res.ok) throw new Error(`unfollow: ${res.status}`);
}

export async function fetchUserFollowers(
  userRef: string,
  opts?: { page?: number; limit?: number },
): Promise<UserListResponse> {
  const sp = new URLSearchParams();
  if (opts?.page != null && opts.page > 0) sp.set("page", String(opts.page));
  if (opts?.limit != null && opts.limit > 0) sp.set("limit", String(opts.limit));
  const enc = encodeURIComponent(userRef.trim());
  const qs = sp.toString();
  const res = await fetch(apiUrl(`/users/${enc}/followers${qs ? `?${qs}` : ""}`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("User not found.");
  if (!res.ok) throw new Error(`followers: ${res.status}`);
  return parseUserListResponse(
    (await res.json()) as Partial<UserListResponse> & { Items?: unknown },
  );
}

export async function fetchUserFollowing(
  userRef: string,
  opts?: { page?: number; limit?: number },
): Promise<UserListResponse> {
  const sp = new URLSearchParams();
  if (opts?.page != null && opts.page > 0) sp.set("page", String(opts.page));
  if (opts?.limit != null && opts.limit > 0) sp.set("limit", String(opts.limit));
  const enc = encodeURIComponent(userRef.trim());
  const qs = sp.toString();
  const res = await fetch(apiUrl(`/users/${enc}/following${qs ? `?${qs}` : ""}`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("User not found.");
  if (!res.ok) throw new Error(`following: ${res.status}`);
  return parseUserListResponse(
    (await res.json()) as Partial<UserListResponse> & { Items?: unknown },
  );
}

function parseUserListResponse(raw: Partial<UserListResponse> & { Items?: unknown }): UserListResponse {
  const items = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.Items)
      ? (raw.Items as PublicUser[])
      : [];
  return {
    items,
    total: typeof raw.total === "number" ? raw.total : 0,
    page: typeof raw.page === "number" ? raw.page : 1,
    page_size: typeof raw.page_size === "number" ? raw.page_size : 24,
  };
}

/** Mutual followers (you follow each other). Requires session. */
export async function fetchMyFriends(opts?: { page?: number; limit?: number }): Promise<UserListResponse> {
  const sp = new URLSearchParams();
  if (opts?.page != null && opts.page > 0) sp.set("page", String(opts.page));
  if (opts?.limit != null && opts.limit > 0) sp.set("limit", String(opts.limit));
  const qs = sp.toString();
  const res = await fetch(apiUrl(`/me/friends${qs ? `?${qs}` : ""}`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Sign in to view friends.");
  if (!res.ok) throw new Error(`friends: ${res.status}`);
  return parseUserListResponse((await res.json()) as Partial<UserListResponse> & { Items?: unknown });
}

/**
 * Public profiles followed by your mutual followers, excluding people you already follow.
 * Requires session.
 */
export async function fetchPeopleYouMayKnow(opts?: {
  page?: number;
  limit?: number;
}): Promise<UserListResponse> {
  const sp = new URLSearchParams();
  if (opts?.page != null && opts.page > 0) sp.set("page", String(opts.page));
  if (opts?.limit != null && opts.limit > 0) sp.set("limit", String(opts.limit));
  const qs = sp.toString();
  const res = await fetch(apiUrl(`/me/people-you-may-know${qs ? `?${qs}` : ""}`), {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Sign in to view suggestions.");
  if (!res.ok) throw new Error(`people you may know: ${res.status}`);
  return parseUserListResponse((await res.json()) as Partial<UserListResponse> & { Items?: unknown });
}

export type Wishlist = {
  id: string;
  user_id: number;
  author?: ShelfAuthor | null;
  name: string;
  description?: string | null;
  cover_art_url?: string | null;
  target_collection_id?: string | null;
  /** Tri-state visibility (source of truth on newer API builds). */
  visibility?: Visibility;
  /** Legacy boolean kept for older clients; prefer `visibility`. */
  is_public: boolean;
  is_shared?: boolean;
  entry_count: number;
  created_at: string;
  updated_at: string;
};

export type WishlistEntry = {
  id: string;
  wishlist_id: string;
  title: string;
  category: Category;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function fetchWishlists(): Promise<Wishlist[]> {
  const res = await fetch(apiUrl("/wishlists"), { credentials: "include" });
  if (res.status === 401) throw new Error("Sign in to view wishlists.");
  if (!res.ok) throw new Error(`wishlists: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchWishlist(id: string): Promise<Wishlist> {
  const res = await fetch(apiUrl(`/wishlists/${id}`), {
    credentials: "include",
  });
  if (res.status === 404) throw new Error("Wishlist not found.");
  if (!res.ok) throw new Error(`wishlist: ${res.status}`);
  return res.json();
}

export async function createWishlist(body: {
  name: string;
  description?: string;
  target_collection_id?: string | null;
  visibility?: Visibility;
  is_public?: boolean;
  is_shared?: boolean;
  invite_user_ids?: number[];
}): Promise<Wishlist> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
    target_collection_id: body.target_collection_id ?? undefined,
  };
  if (body.visibility !== undefined) payload.visibility = body.visibility;
  if (body.is_public !== undefined) payload.is_public = body.is_public;
  if (body.is_shared === true) payload.is_shared = true;
  if (body.invite_user_ids != null && body.invite_user_ids.length > 0) {
    payload.invite_user_ids = body.invite_user_ids;
  }
  const res = await fetch(apiUrl("/wishlists"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("Sign in to create a wishlist.");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `create wishlist: ${res.status}`);
  }
  return res.json();
}

export async function updateWishlist(
  id: string,
  body: {
    name: string;
    description?: string;
    target_collection_id?: string | null;
    visibility?: Visibility;
    is_public?: boolean;
    /** Omit to leave unchanged; empty string clears the cover. */
    cover_art_url?: string;
    /** When set, updates whether the wishlist is shared (owner only). */
    is_shared?: boolean;
    invite_user_ids?: number[];
  },
): Promise<Wishlist> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
  };
  if (body.visibility !== undefined) payload.visibility = body.visibility;
  if (body.is_public !== undefined) payload.is_public = body.is_public;
  if (body.cover_art_url !== undefined)
    payload.cover_art_url = body.cover_art_url;
  if (body.is_shared !== undefined) payload.is_shared = body.is_shared;
  if (body.invite_user_ids != null && body.invite_user_ids.length > 0) {
    payload.invite_user_ids = body.invite_user_ids;
  }
  if (
    body.target_collection_id === null ||
    body.target_collection_id === undefined
  ) {
    payload.target_collection_id = null;
  } else {
    payload.target_collection_id = body.target_collection_id;
  }
  const res = await fetch(apiUrl(`/wishlists/${id}`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `update wishlist: ${res.status}`);
  }
  return res.json();
}

export type EntryDeleteMoveTarget = { id: string; name: string };

export type EntryDeleteConflictPayload = {
  entry_count: number;
  eligible_move_targets: EntryDeleteMoveTarget[];
};

export type DeleteWishlistOutcome =
  | { ok: true }
  | { ok: false; conflict: EntryDeleteConflictPayload }
  | { ok: false; message: string };

/** Delete a wishlist you own. Call with no options first when entries may exist to receive 409 + eligible targets. */
export async function deleteWishlist(
  id: string,
  opts?: { move_entries_to?: string; discard_entries?: boolean },
): Promise<DeleteWishlistOutcome> {
  const body: Record<string, unknown> = {};
  if (opts?.move_entries_to) body.move_entries_to = opts.move_entries_to;
  if (opts?.discard_entries) body.discard_entries = true;
  const res = await fetch(apiUrl(`/wishlists/${id}`), {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return { ok: true };
  if (res.status === 401)
    return { ok: false, message: "Sign in to delete a wishlist." };
  if (res.status === 409) {
    const j = (await res.json()) as {
      entry_count?: number;
      eligible_move_targets?: EntryDeleteMoveTarget[];
    };
    return {
      ok: false,
      conflict: {
        entry_count: Number(j.entry_count ?? 0),
        eligible_move_targets: Array.isArray(j.eligible_move_targets)
          ? j.eligible_move_targets
          : [],
      },
    };
  }
  const t = await res.text();
  return { ok: false, message: t || `delete wishlist: ${res.status}` };
}

export async function fetchWishlistEntries(
  wishlistId: string,
): Promise<WishlistEntry[]> {
  const res = await fetch(apiUrl(`/wishlists/${wishlistId}/entries`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`wishlist entries: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createWishlistEntry(
  wishlistId: string,
  body: {
    title: string;
    category: Category;
    metadata: Record<string, unknown>;
  },
): Promise<WishlistEntry> {
  const res = await fetch(apiUrl(`/wishlists/${wishlistId}/entries`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: body.title.trim(),
      category: body.category,
      metadata: body.metadata,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `add entry: ${res.status}`);
  }
  return res.json();
}

export async function deleteWishlistEntry(
  wishlistId: string,
  entryId: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(`/wishlists/${wishlistId}/entries/${entryId}`),
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error(`delete entry: ${res.status}`);
}

/** CSV columns: id, title, category, metadata (JSON). Owner-only. */
export async function exportWishlistEntriesCsv(
  wishlistId: string,
): Promise<Blob> {
  const res = await fetch(apiUrl(`/wishlists/${wishlistId}/entries.csv`), {
    credentials: "include",
  });
  if (res.status === 401) throw new Error("Sign in to export.");
  if (res.status === 403)
    throw new Error("Only the wishlist owner can export entries.");
  if (!res.ok) throw new Error(`export: ${res.status}`);
  return res.blob();
}

export async function importWishlistEntriesCsv(
  wishlistId: string,
  file: File,
): Promise<ImportItemsResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl(`/wishlists/${wishlistId}/entries/import`), {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (res.status === 401) throw new Error("Sign in to import.");
  if (res.status === 403)
    throw new Error("Only the wishlist owner can import entries.");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `import: ${res.status}`);
  }
  return res.json() as Promise<ImportItemsResult>;
}

export async function obtainWishlistEntry(
  wishlistId: string,
  entryId: string,
  collectionId?: string,
): Promise<Item> {
  const res = await fetch(
    apiUrl(`/wishlists/${wishlistId}/entries/${entryId}/obtain`),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        collectionId != null && collectionId.trim() !== ""
          ? { collection_id: collectionId }
          : {},
      ),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `obtain: ${res.status}`);
  }
  return res.json();
}

export type List = {
  id: string;
  user_id: number;
  author?: ShelfAuthor | null;
  name: string;
  description?: string | null;
  cover_art_url?: string | null;
  /** Tri-state visibility (source of truth on newer API builds). */
  visibility?: Visibility;
  /** Legacy boolean kept for older clients; prefer `visibility`. */
  is_public: boolean;
  is_shared?: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export async function fetchLists(): Promise<List[]> {
  const res = await fetch(apiUrl("/lists"), { credentials: "include" });
  if (res.status === 401) throw new Error("Sign in to view lists.");
  if (!res.ok) throw new Error(`lists: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchList(id: string): Promise<List> {
  const res = await fetch(apiUrl(`/lists/${id}`), { credentials: "include" });
  if (res.status === 404) throw new Error("List not found.");
  if (!res.ok) throw new Error(`list: ${res.status}`);
  return res.json();
}

export async function createList(body: {
  name: string;
  description?: string;
  visibility?: Visibility;
  is_public?: boolean;
  is_shared?: boolean;
  invite_user_ids?: number[];
}): Promise<List> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
  };
  if (body.visibility !== undefined) payload.visibility = body.visibility;
  if (body.is_public !== undefined) payload.is_public = body.is_public;
  if (body.is_shared === true) payload.is_shared = true;
  if (body.invite_user_ids != null && body.invite_user_ids.length > 0) {
    payload.invite_user_ids = body.invite_user_ids;
  }
  const res = await fetch(apiUrl("/lists"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("Sign in to create a list.");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `create list: ${res.status}`);
  }
  return res.json();
}

export async function updateList(
  id: string,
  body: {
    name: string;
    description?: string;
    visibility?: Visibility;
    is_public?: boolean;
    cover_art_url?: string;
    is_shared?: boolean;
    invite_user_ids?: number[];
  },
): Promise<List> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
  };
  if (body.visibility !== undefined) payload.visibility = body.visibility;
  if (body.is_public !== undefined) payload.is_public = body.is_public;
  if (body.cover_art_url !== undefined)
    payload.cover_art_url = body.cover_art_url;
  if (body.is_shared !== undefined) payload.is_shared = body.is_shared;
  if (body.invite_user_ids != null && body.invite_user_ids.length > 0) {
    payload.invite_user_ids = body.invite_user_ids;
  }
  const res = await fetch(apiUrl(`/lists/${id}`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `update list: ${res.status}`);
  }
  return res.json();
}

export type DeleteListOutcome =
  | { ok: true }
  | { ok: false; conflict: EntryDeleteConflictPayload }
  | { ok: false; message: string };

/** Delete a list you own. Call with no options first when the list has item links to receive 409 + eligible targets. */
export async function deleteList(
  id: string,
  opts?: { move_entries_to?: string; discard_entries?: boolean },
): Promise<DeleteListOutcome> {
  const body: Record<string, unknown> = {};
  if (opts?.move_entries_to) body.move_entries_to = opts.move_entries_to;
  if (opts?.discard_entries) body.discard_entries = true;
  const res = await fetch(apiUrl(`/lists/${id}`), {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return { ok: true };
  if (res.status === 401)
    return { ok: false, message: "Sign in to delete a list." };
  if (res.status === 409) {
    const j = (await res.json()) as {
      entry_count?: number;
      eligible_move_targets?: EntryDeleteMoveTarget[];
    };
    return {
      ok: false,
      conflict: {
        entry_count: Number(j.entry_count ?? 0),
        eligible_move_targets: Array.isArray(j.eligible_move_targets)
          ? j.eligible_move_targets
          : [],
      },
    };
  }
  const t = await res.text();
  return { ok: false, message: t || `delete list: ${res.status}` };
}

export async function fetchListItems(listId: string): Promise<Item[]> {
  const res = await fetch(apiUrl(`/lists/${listId}/items`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`list items: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function addListItem(
  listId: string,
  itemId: string,
): Promise<void> {
  const res = await fetch(apiUrl(`/lists/${listId}/items`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id: itemId }),
  });
  if (res.status === 401) throw new Error("Sign in.");
  if (res.status === 404) throw new Error("Item not found.");
  if (res.status === 403)
    throw new Error("You can only add items from shelves you can edit.");
  if (res.status === 409) throw new Error("That item is already on this list.");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `add to list: ${res.status}`);
  }
}

export async function removeListItem(
  listId: string,
  itemId: string,
): Promise<void> {
  const res = await fetch(apiUrl(`/lists/${listId}/items/${itemId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`remove from list: ${res.status}`);
}

export async function createItem(body: {
  title: string;
  category: Category;
  /** Omit to let the API use your oldest shelf (requires at least one collection). */
  collection_id?: string;
  metadata: Record<string, unknown>;
  /** 1–5, or null to leave unrated. */
  rating?: number | null;
  consumption_status?: ConsumptionStatus;
}): Promise<Item> {
  const payload: Record<string, unknown> = {
    title: body.title,
    category: body.category,
    metadata: body.metadata,
  };
  if (body.collection_id !== undefined) {
    payload.collection_id = body.collection_id;
  }
  if (body.rating !== undefined) {
    payload.rating = body.rating;
  }
  if (body.consumption_status !== undefined) {
    payload.consumption_status = body.consumption_status;
  }
  const res = await fetch(apiUrl("/items"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `create: ${res.status}`);
  }
  return res.json();
}

export async function updateItem(
  id: string,
  body: {
    title: string;
    category: Category;
    metadata: Record<string, unknown>;
    /** Set a number (1–5), or `null` to clear. Omit to leave the stored rating unchanged. */
    rating?: number | null;
    /** Omit to leave consumption unchanged. */
    consumption_status?: ConsumptionStatus;
    /** When set, moves the item to another collection you own (other fields still updated). */
    collection_id?: string;
  },
): Promise<Item> {
  const payload: Record<string, unknown> = {
    title: body.title,
    category: body.category,
    metadata: body.metadata,
  };
  if (body.rating !== undefined) {
    payload.rating = body.rating;
  }
  if (body.consumption_status !== undefined) {
    payload.consumption_status = body.consumption_status;
  }
  if (body.collection_id !== undefined) {
    payload.collection_id = body.collection_id;
  }
  const res = await fetch(apiUrl(`/items/${id}`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `update item: ${res.status}`);
  }
  return res.json() as Promise<Item>;
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/items/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (res.status === 401) {
    throw new Error("Sign in to delete this item.");
  }
  if (res.status === 403) {
    throw new Error("You can only delete items from your own collections.");
  }
  if (res.status === 404) {
    throw new Error("Item not found.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `delete item: ${res.status}`);
  }
}

export async function searchItems(q: string, limit = 20): Promise<unknown> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(apiUrl(`/search?${params}`));
  if (!res.ok) throw new Error(`search: ${res.status}`);
  return res.json();
}

export type MetadataHit = {
  source: string;
  title: string;
  subtitle?: string;
  year?: number;
  thumb_url?: string;
  external_id?: string;
  artist?: string;
  album?: string;
  platform?: string;
  genre?: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  extra?: Record<string, unknown>;
};

export type MetadataLookupResponse = {
  source: string;
  query: string;
  stub: boolean;
  message?: string;
  results?: MetadataHit[];
};

/** Search external catalogs by title (category selects the backend provider). */
export async function fetchMetadataLookup(
  category: Category,
  q: string,
): Promise<MetadataLookupResponse> {
  const params = new URLSearchParams({ category, q });
  const res = await fetch(apiUrl(`/metadata/lookup?${params}`), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`metadata: ${res.status}`);
  return res.json();
}

/** Multipart upload to S3-backed storage (requires login). */
export async function uploadCoverImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl("/images"), {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (res.status === 401) {
    throw new Error("Sign in to upload images to storage.");
  }
  if (res.status === 503) {
    throw new Error("Image storage is not configured on the server.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `upload: ${res.status}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Invalid upload response");
  return data.url;
}

/** Multipart upload for profile avatars (stored under avatars/ in S3). Requires login and S3 config. */
export async function uploadAvatarImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl("/images?kind=avatar"), {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (res.status === 401) {
    throw new Error("Sign in to upload images to storage.");
  }
  if (res.status === 503) {
    throw new Error("Image storage is not configured on the server.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `upload: ${res.status}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Invalid upload response");
  return data.url;
}

/** Profile banner (wide image), stored under banners/ in S3. Requires login and S3 config. */
export async function uploadBannerImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl("/images?kind=banner"), {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (res.status === 401) {
    throw new Error("Sign in to upload images to storage.");
  }
  if (res.status === 503) {
    throw new Error("Image storage is not configured on the server.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `upload: ${res.status}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Invalid upload response");
  return data.url;
}

/** Server fetches a remote image and stores it in S3 (requires login). */
export async function importCoverImageFromUrl(url: string): Promise<string> {
  const res = await fetch(apiUrl("/images"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (res.status === 401) {
    throw new Error("Sign in to import images into storage.");
  }
  if (res.status === 503) {
    throw new Error("Image storage is not configured on the server.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `import: ${res.status}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Invalid import response");
  return data.url;
}
