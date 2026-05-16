import type { Wishlist } from "@/lib/api";

export type WishlistsListFilters = {
  q: string;
};

function first(v: string | string[] | undefined): string {
  if (v === undefined) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

/** Parse filters from Next `searchParams` record (server or client). */
export function parseWishlistsListRecord(
  sp: Record<string, string | string[] | undefined> | undefined,
): WishlistsListFilters {
  const raw = sp ?? {};
  return { q: first(raw.q) };
}

/** Parse from `window.location.search` or a `?foo=bar` string. */
export function parseWishlistsListSearchString(search: string): WishlistsListFilters {
  const qs = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(qs);
  const record: Record<string, string> = {};
  p.forEach((value, key) => {
    record[key] = value;
  });
  return parseWishlistsListRecord(record);
}

/** Build query string (no leading `?`). Omits defaults so URLs stay short. */
export function stringifyWishlistsListFilters(f: WishlistsListFilters): string {
  const p = new URLSearchParams();
  const q = f.q.trim();
  if (q) p.set("q", q);
  return p.toString();
}

/** Client-side filter: name or description contains query (case-insensitive). */
export function filterWishlistsByQuery(wishlists: Wishlist[], q: string): Wishlist[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return wishlists;
  return wishlists.filter((w) => {
    const name = (w.name ?? "").toLowerCase();
    const desc = (w.description ?? "").toLowerCase();
    return name.includes(needle) || desc.includes(needle);
  });
}
