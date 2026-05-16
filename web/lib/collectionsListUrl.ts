const SORT_DEFAULT = "name_asc";
const ALLOWED_SORT = new Set([
  "name_asc",
  "name_desc",
  "updated_desc",
  "created_desc",
  "items_desc",
]);

export type CollectionsListFilters = {
  q: string;
  page: number;
  sort: string;
  scope: "all" | "following";
};

function first(v: string | string[] | undefined): string {
  if (v === undefined) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

/** Parse filters from Next `searchParams` record (server or client). */
export function parseCollectionsListRecord(
  sp: Record<string, string | string[] | undefined> | undefined
): CollectionsListFilters {
  const raw = sp ?? {};
  const page = Math.max(1, Number(first(raw.page)) || 1);
  const sortIn = first(raw.sort) || SORT_DEFAULT;
  const sort = ALLOWED_SORT.has(sortIn) ? sortIn : SORT_DEFAULT;
  const q = first(raw.q);
  const scopeRaw = first(raw.scope);
  const scope: "all" | "following" = scopeRaw === "following" ? "following" : "all";
  return { q, page, sort, scope };
}

/** Parse from `window.location.search` or a `?foo=bar` string. */
export function parseCollectionsListSearchString(search: string): CollectionsListFilters {
  const qs = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(qs);
  const record: Record<string, string> = {};
  p.forEach((value, key) => {
    record[key] = value;
  });
  return parseCollectionsListRecord(record);
}

/** Build query string (no leading `?`). Omits defaults so URLs stay short. */
export function stringifyCollectionsListFilters(f: CollectionsListFilters): string {
  const p = new URLSearchParams();
  const q = f.q.trim();
  if (q) p.set("q", q);
  if (f.page > 1) p.set("page", String(f.page));
  if (f.sort && f.sort !== SORT_DEFAULT) p.set("sort", f.sort);
  if (f.scope === "following") p.set("scope", "following");
  return p.toString();
}
