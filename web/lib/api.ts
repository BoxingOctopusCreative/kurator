import { apiUrl } from "./apiUrl";
import type { SocialLinkInput } from "./validation";

export type Category =
  | "game"
  | "music"
  | "book"
  | "video"
  | "comic_book"
  | "manga";

export type Item = {
  id: number;
  collection_id: number;
  title: string;
  category: Category;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Collection = {
  id: number;
  user_id?: number | null;
  name: string;
  description?: string | null;
  is_public: boolean;
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

export async function fetchLatestItems(limit = 24): Promise<Item[]> {
  const res = await fetch(apiUrl(`/items?limit=${limit}`), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`items: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchItems(opts?: {
  limit?: number;
  collectionId?: number;
  /** Requires login. Ignored when collectionId is set. */
  scope?: "mine" | "following";
}): Promise<Item[]> {
  const sp = new URLSearchParams({ limit: String(opts?.limit ?? 48) });
  if (opts?.collectionId != null) sp.set("collection_id", String(opts.collectionId));
  if (opts?.scope && opts.collectionId == null) sp.set("scope", opts.scope);
  const res = await fetch(apiUrl(`/items?${sp}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`items: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
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
  const res = await fetch(apiUrl(`/collections?${sp}`), { credentials: "include" });
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

export async function fetchCollection(id: number): Promise<Collection> {
  const res = await fetch(apiUrl(`/collections/${id}`), { credentials: "include" });
  if (res.status === 404) throw new Error("Collection not found.");
  if (!res.ok) throw new Error(`collection: ${res.status}`);
  return res.json();
}

export async function createCollection(body: {
  name: string;
  description?: string;
  is_public?: boolean;
}): Promise<Collection> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
  };
  if (body.is_public !== undefined) payload.is_public = body.is_public;
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
  id: number,
  body: { name?: string; description?: string; is_public?: boolean }
): Promise<Collection> {
  const res = await fetch(apiUrl(`/collections/${id}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
export function publicLegalNameLine(u: Pick<PublicUser, "first_name" | "last_name">): string | null {
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

export async function searchUsers(q: string): Promise<PublicUser[]> {
  const sp = new URLSearchParams({ q: q.trim() });
  const res = await fetch(apiUrl(`/users/search?${sp}`), { credentials: "include" });
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
export async function fetchPublicUserProfile(userRef: string): Promise<UserProfile | null> {
  const enc = encodeURIComponent(userRef.trim());
  const res = await fetch(apiUrl(`/users/${enc}`), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`profile: ${res.status}`);
  return res.json() as Promise<UserProfile>;
}

/** Public collections for a user (no auth). */
export async function fetchPublicCollectionsSnapshot(ownerUserId: number): Promise<CollectionListResponse> {
  const sp = new URLSearchParams({
    owner_user_id: String(ownerUserId),
    limit: "48",
    sort: "updated_desc",
  });
  const res = await fetch(apiUrl(`/collections?${sp}`), { cache: "no-store" });
  if (!res.ok) {
    return { items: [], total: 0, page: 1, page_size: 48 };
  }
  const data = (await res.json()) as CollectionListResponse;
  if (!data.items) {
    return { ...data, items: [] };
  }
  return data;
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

export type Wishlist = {
  id: number;
  user_id: number;
  name: string;
  description?: string | null;
  target_collection_id?: number | null;
  is_public: boolean;
  entry_count: number;
  created_at: string;
  updated_at: string;
};

export type WishlistEntry = {
  id: number;
  wishlist_id: number;
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

export async function fetchWishlist(id: number): Promise<Wishlist> {
  const res = await fetch(apiUrl(`/wishlists/${id}`), { credentials: "include" });
  if (res.status === 404) throw new Error("Wishlist not found.");
  if (!res.ok) throw new Error(`wishlist: ${res.status}`);
  return res.json();
}

export async function createWishlist(body: {
  name: string;
  description?: string;
  target_collection_id?: number | null;
  is_public?: boolean;
}): Promise<Wishlist> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
    target_collection_id: body.target_collection_id ?? undefined,
  };
  if (body.is_public !== undefined) payload.is_public = body.is_public;
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
  id: number,
  body: {
    name: string;
    description?: string;
    target_collection_id?: number | null;
    is_public?: boolean;
  }
): Promise<Wishlist> {
  const payload: Record<string, unknown> = {
    name: body.name.trim(),
    description: body.description?.trim() ?? "",
  };
  if (body.is_public !== undefined) payload.is_public = body.is_public;
  if (body.target_collection_id === null || body.target_collection_id === undefined) {
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

export async function deleteWishlist(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/wishlists/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`delete wishlist: ${res.status}`);
}

export async function fetchWishlistEntries(wishlistId: number): Promise<WishlistEntry[]> {
  const res = await fetch(apiUrl(`/wishlists/${wishlistId}/entries`), { credentials: "include" });
  if (!res.ok) throw new Error(`wishlist entries: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createWishlistEntry(
  wishlistId: number,
  body: { title: string; category: Category; metadata: Record<string, unknown> }
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

export async function deleteWishlistEntry(wishlistId: number, entryId: number): Promise<void> {
  const res = await fetch(apiUrl(`/wishlists/${wishlistId}/entries/${entryId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`delete entry: ${res.status}`);
}

export async function obtainWishlistEntry(
  wishlistId: number,
  entryId: number,
  collectionId?: number
): Promise<Item> {
  const res = await fetch(apiUrl(`/wishlists/${wishlistId}/entries/${entryId}/obtain`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      collectionId != null && collectionId > 0 ? { collection_id: collectionId } : {}
    ),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `obtain: ${res.status}`);
  }
  return res.json();
}

export async function createItem(body: {
  title: string;
  category: Category;
  collection_id?: number;
  metadata: Record<string, unknown>;
}): Promise<Item> {
  const res = await fetch(apiUrl("/items"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: body.title,
      category: body.category,
      collection_id: body.collection_id ?? 1,
      metadata: body.metadata,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `create: ${res.status}`);
  }
  return res.json();
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
export async function fetchMetadataLookup(category: Category, q: string): Promise<MetadataLookupResponse> {
  const params = new URLSearchParams({ category, q });
  // Always use same-origin /api/v1 in the browser so Next rewrites proxy to the Kurator API.
  // Using NEXT_PUBLIC_API_URL here would skip the rewrite and can hit the wrong host (401s from gateways or other services).
  const url =
    typeof window !== "undefined"
      ? `/api/v1/metadata/lookup?${params}`
      : apiUrl(`/metadata/lookup?${params}`);
  const res = await fetch(url, { cache: "no-store" });
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

export type SetupInfo = {
  setup_enabled: boolean;
};

export async function fetchSetupInfo(): Promise<SetupInfo> {
  const res = await fetch(apiUrl("/setup"), { cache: "no-store" });
  if (!res.ok) throw new Error(`setup: ${res.status}`);
  return res.json() as Promise<SetupInfo>;
}

export type SetupStatus = {
  setup_enabled: boolean;
  connected?: boolean;
  pending?: boolean;
  applied?: string[];
  expected?: string[];
  applied_count?: number;
  expected_count?: number;
  message?: string;
};

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(apiUrl("/setup/status"), { cache: "no-store" });
  if (!res.ok) throw new Error(`setup status: ${res.status}`);
  return res.json() as Promise<SetupStatus>;
}

export type SetupMigrateBody = {
  database_url?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  sslmode?: string;
};

export async function runSetupMigrate(body: SetupMigrateBody): Promise<{ ok: boolean; applied: string[] }> {
  const res = await fetch(apiUrl("/setup/migrate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { message?: string; ok?: boolean; applied?: string[] };
  if (!res.ok) {
    throw new Error(data.message || `setup migrate: ${res.status}`);
  }
  return { ok: !!data.ok, applied: data.applied ?? [] };
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
