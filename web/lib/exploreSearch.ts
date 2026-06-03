import { apiUrl } from "@/lib/apiUrl";

export type ExploreSearchKind =
  | "collection"
  | "hitlist"
  | "wishlist"
  | "board"
  | "thread"
  | "reply"
  | "hitlist_comment"
  | "user";

export type ExploreSearchHit = {
  kind: ExploreSearchKind;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
};

export type ExploreSearchResponse = {
  query: string;
  hits: ExploreSearchHit[];
};

const KIND_LABELS: Record<ExploreSearchKind, string> = {
  collection: "Collection",
  hitlist: "Hitlist",
  wishlist: "Wishlist",
  board: "Board",
  thread: "Thread",
  reply: "Reply",
  hitlist_comment: "Comment",
  user: "Profile",
};

export function exploreSearchKindLabel(kind: ExploreSearchKind): string {
  return KIND_LABELS[kind] ?? kind;
}

export async function fetchExploreSearch(
  q: string,
  limit = 6
): Promise<ExploreSearchResponse> {
  const sp = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  const res = await fetch(apiUrl(`/explore/search?${sp}`), {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Search failed (${res.status})`);
  }
  return res.json() as Promise<ExploreSearchResponse>;
}
