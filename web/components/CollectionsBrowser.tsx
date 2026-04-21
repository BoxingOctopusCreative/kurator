"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CircleHelp, Layers, Lock, Trash2 } from "lucide-react";
import type { Category, Collection, CollectionListResponse } from "@/lib/api";
import { createCollection, fetchCollections } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { DeleteCollectionDialog, type DeleteCollectionSubject } from "@/components/DeleteCollectionDialog";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import type { CollectionsListFilters } from "@/lib/collectionsListUrl";
import {
  parseCollectionsListSearchString,
  stringifyCollectionsListFilters,
} from "@/lib/collectionsListUrl";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";

const sortOptions: { value: string; label: string }[] = [
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "updated_desc", label: "Recently Updated" },
  { value: "created_desc", label: "Recently Created" },
  { value: "items_desc", label: "Most Items" },
];

const descFilterOptions: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  { value: "yes", label: "Has Description" },
  { value: "no", label: "No Description" },
];

const shelfCategoryOptions: { value: Category; label: string }[] = [
  { value: "game", label: "Games" },
  { value: "music", label: "Music" },
  { value: "book", label: "Books" },
  { value: "movies", label: "Movies" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "comic_book", label: "Comic books" },
  { value: "manga", label: "Manga" },
];

type Props = {
  basePath: string;
  initialFilters: CollectionsListFilters;
};

export function CollectionsBrowser({ basePath, initialFilters }: Props) {
  const { user } = useAuth();

  const [filters, setFilters] = useState<CollectionsListFilters>(initialFilters);
  const [qInput, setQInput] = useState(initialFilters.q);
  const [data, setData] = useState<CollectionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPublic, setNewPublic] = useState(true);
  const [newShelfCategory, setNewShelfCategory] = useState<Category>("game");
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [deleteSubject, setDeleteSubject] = useState<DeleteCollectionSubject | null>(null);

  const effectiveScope: "all" | "following" =
    filters.scope === "following" && user ? "following" : "all";

  const commitFilters = useCallback(
    (next: CollectionsListFilters | ((prev: CollectionsListFilters) => CollectionsListFilters)) => {
      setFilters((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        const qs = stringifyCollectionsListFilters(resolved);
        const path = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
        const url = qs ? `${path}?${qs}` : path;
        window.history.replaceState(window.history.state, "", url);
        return resolved;
      });
    },
    [basePath]
  );

  useEffect(() => {
    const onPopState = () => {
      const next = parseCollectionsListSearchString(window.location.search);
      setFilters(next);
      setQInput(next.q);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (user === null && filters.scope === "following") {
      commitFilters((f) => ({ ...f, scope: "all", page: 1 }));
    }
  }, [user, filters.scope, commitFilters]);

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = qInput.trim();
      if (trimmed !== filters.q.trim()) {
        commitFilters((f) => ({ ...f, q: trimmed, page: 1 }));
        setQInput(trimmed);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, filters.q, commitFilters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCollections({
      q: filters.q.trim() || undefined,
      page: filters.page,
      limit: 12,
      sort: filters.sort,
      has_description: filters.has_description || undefined,
      scope: effectiveScope === "following" ? "following" : "all",
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load collections.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.q, filters.page, filters.sort, filters.has_description, effectiveScope, listVersion]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  async function onCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setCreating(true);
    try {
      const name = assertCollectionOrWishlistName(newName, "Collection name");
      const descRaw = newDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(newDesc, LIMITS.description, "Description")
        : undefined;
      await createCollection({ name, description, is_public: newPublic, category: newShelfCategory });
      setNewName("");
      setNewDesc("");
      setNewPublic(true);
      setNewShelfCategory("game");
      setFormMsg("Collection created.");
      setListVersion((v) => v + 1);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create collection.");
    } finally {
      setCreating(false);
    }
  }

  function isMyCollection(c: Collection): boolean {
    return Boolean(user && c.user_id != null && Number(c.user_id) === Number(user.id));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <DeleteCollectionDialog
        collection={deleteSubject}
        open={deleteSubject != null}
        onOpenChange={(v) => {
          if (!v) setDeleteSubject(null);
        }}
        onDeleted={() => {
          setDeleteSubject(null);
          setListVersion((x) => x + 1);
        }}
      />
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Collections</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Public shelves are visible to everyone. Private shelves are only visible to you. Follow people
            under People to see their public collections in the Following tab.
          </p>
        </div>
      </div>

      <form
        onSubmit={onCreateCollection}
        className="mb-8 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4"
      >
        <div className="group relative inline-flex items-center gap-1.5">
          <h2 className="text-sm font-medium text-kurator-fg">New Collection</h2>
          <button
            type="button"
            className="-m-0.5 inline-flex shrink-0 rounded-sm p-0.5 text-kurator-muted hover:text-kurator-fg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
            aria-label="New collection shelves appear in this list and in Add item → Collection."
          >
            <CircleHelp className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-1.5 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
          >
            New collection shelves appear in this list and in Add item → Collection.
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[200px] flex-1 text-sm">
            <span className="text-kurator-muted">Name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Graphic novels, Switch games"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
          </label>
          <label className="block min-w-[220px] flex-2 text-sm">
            <span className="text-kurator-muted">Description (Optional)</span>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short note about this shelf"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
          </label>
          <label className="block min-w-[200px] text-sm">
            <span className="group relative inline-flex items-center gap-1.5 text-kurator-muted">
              <span>Shelf Type</span>
              <button
                type="button"
                className="-m-0.5 inline-flex shrink-0 rounded-sm p-0.5 text-kurator-muted hover:text-kurator-fg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                aria-label="Items on this shelf use the category you select."
              >
                <CircleHelp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-1.5 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              >
                Items on this shelf use the category you select.
              </span>
            </span>
            <select
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={newShelfCategory}
              onChange={(e) => setNewShelfCategory(e.target.value as Category)}
            >
              {shelfCategoryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-kurator-muted">
            <input
              type="checkbox"
              checked={newPublic}
              onChange={(e) => setNewPublic(e.target.checked)}
              className="rounded-sm border-kurator-border"
            />
            Public
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
        {formMsg && (
          <p
            className={`mt-3 text-sm ${formMsg.startsWith("Collection created") ? "text-emerald-300/90" : "text-amber-200/90"}`}
            role="status"
          >
            {formMsg}
          </p>
        )}
      </form>

      {user && (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Collection Source">
          <button
            type="button"
            role="tab"
            aria-selected={effectiveScope === "all"}
            onClick={() => commitFilters((f) => ({ ...f, scope: "all", page: 1 }))}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              effectiveScope === "all"
                ? "bg-kurator-accent text-kurator-onAccent"
                : "border border-kurator-border text-kurator-muted hover:bg-kurator-border/40"
            }`}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveScope === "following"}
            onClick={() => commitFilters((f) => ({ ...f, scope: "following", page: 1 }))}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              effectiveScope === "following"
                ? "bg-kurator-accent text-kurator-onAccent"
                : "border border-kurator-border text-kurator-muted hover:bg-kurator-border/40"
            }`}
          >
            Following
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block min-w-[200px] flex-1 text-sm">
          <span className="text-kurator-muted">Search</span>
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Name or description…"
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            autoComplete="off"
          />
        </label>
        <label className="block min-w-[160px] text-sm">
          <span className="text-kurator-muted">Sort</span>
          <select
            value={filters.sort}
            onChange={(e) => commitFilters((f) => ({ ...f, sort: e.target.value, page: 1 }))}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[180px] text-sm">
          <span className="text-kurator-muted">Description</span>
          <select
            value={filters.has_description}
            onChange={(e) =>
              commitFilters((f) => ({
                ...f,
                has_description: (e.target.value || "") as "" | "yes" | "no",
                page: 1,
              }))
            }
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
          >
            {descFilterOptions.map((o) => (
              <option key={o.value || "any"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {loading && !data && (
        <p className="text-sm text-kurator-muted">Loading collections…</p>
      )}

      {!loading && data && data.items.length === 0 && (
        <p className="rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          No collections match your filters.
        </p>
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((c) => (
              <li key={c.id} className="relative">
                {isMyCollection(c) && (
                  <button
                    type="button"
                    aria-label={`Delete Collection ${c.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteSubject({ id: c.id, name: c.name, item_count: c.item_count });
                    }}
                    className="absolute right-2 top-2 z-10 rounded-lg border border-kurator-border bg-kurator-bg/95 p-2 text-kurator-muted shadow-sm hover:border-red-500/50 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
                <Link
                  href={`/collections/${c.id}`}
                  className="flex h-full flex-col rounded-xl border border-kurator-border bg-kurator-surface p-4 shadow-xs transition-colors hover:border-kurator-accent/50 hover:bg-kurator-bg/80"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg">
                      {c.cover_art_url ? (
                        <ItemCoverImage url={c.cover_art_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-kurator-border/60 text-kurator-accent">
                          <Layers className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium text-kurator-fg">{c.name}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-kurator-muted">
                        <span>
                          {c.item_count} {c.item_count === 1 ? "item" : "items"}
                        </span>
                        {c.is_public === false && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                            <Lock className="h-3 w-3" aria-hidden />
                            Private
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {c.description && (
                    <p className="mt-3 line-clamp-3 text-sm text-kurator-muted">{c.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <nav className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm" aria-label="Pagination">
            <button
              type="button"
              disabled={filters.page <= 1 || loading}
              onClick={() => commitFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-kurator-muted hover:bg-kurator-border/40 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-kurator-muted">
              Page {filters.page} of {totalPages}
              <span className="ml-2 text-kurator-muted/70">({data.total} total)</span>
            </span>
            <button
              type="button"
              disabled={filters.page >= totalPages || loading}
              onClick={() => commitFilters((f) => ({ ...f, page: f.page + 1 }))}
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-kurator-muted hover:bg-kurator-border/40 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
