"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Layers, Lock, Trash2, Users } from "lucide-react";
import type { Collection, CollectionListResponse } from "@/lib/api";
import { fetchCollections, visibilityOf } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { CollectionCreateModal } from "@/components/CollectionCreateModal";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { DeleteCollectionDialog, type DeleteCollectionSubject } from "@/components/DeleteCollectionDialog";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import type { CollectionsListFilters } from "@/lib/collectionsListUrl";
import {
  parseCollectionsListSearchString,
  stringifyCollectionsListFilters,
} from "@/lib/collectionsListUrl";

const sortOptions: { value: string; label: string }[] = [
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "updated_desc", label: "Recently Updated" },
  { value: "created_desc", label: "Recently Created" },
  { value: "items_desc", label: "Most Items" },
];

type Props = {
  basePath: string;
  initialFilters: CollectionsListFilters;
};

export function CollectionsBrowser({ basePath, initialFilters }: Props) {
  const router = useRouter();
  const { user } = useAuth();

  const [filters, setFilters] = useState<CollectionsListFilters>(initialFilters);
  const [qInput, setQInput] = useState(initialFilters.q);
  const [data, setData] = useState<CollectionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

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
  }, [filters.q, filters.page, filters.sort, effectiveScope, listVersion]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  function onCreateClick() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(basePath)}`);
      return;
    }
    setCreateOpen(true);
  }

  function isMyCollection(c: Collection): boolean {
    return Boolean(user && c.user_id != null && Number(c.user_id) === Number(user.id));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <CollectionCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setListVersion((v) => v + 1)}
      />
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
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Collections</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Choose who can see each shelf: yourself only, your followers, or just mutuals. Follow people under
            People to see their shelves in the Following tab.
          </p>
        </div>
      </PageHeroUnsplash>

      <div className="mb-6 flex flex-col gap-4 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          {user && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Collection Source">
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
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
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
          </div>
        </div>
        <button
          type="button"
          onClick={onCreateClick}
          className="inline-flex w-full shrink-0 items-center justify-center rounded-lg bg-kurator-accent px-4 py-2 text-sm font-semibold text-kurator-onAccent hover:opacity-90 md:ms-4 md:w-auto md:self-end"
        >
          Create Your Own!
        </button>
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
        <p className="rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          No collections match your filters. {!user ? "Sign in to create one." : "Create one with Create Your Own!"}
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
                    className="absolute right-2 top-2 z-10 rounded-lg bg-kurator-bg/95 p-2 text-kurator-muted shadow-sm transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
                <div className="flex h-full flex-col overflow-hidden rounded-xl border border-kurator-border bg-kurator-surface shadow-surface transition-colors hover:border-kurator-accent/50 hover:bg-kurator-bg/80">
                  <Link
                    href={`/collections/${c.id}`}
                    className="flex flex-1 flex-col p-4 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
                        {c.cover_art_url ? (
                          <ItemCoverImage url={c.cover_art_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-kurator-border/60 text-kurator-accent">
                            <Layers className="h-5 w-5" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="kurator-shelf-tile-title font-medium text-kurator-fg">{c.name}</h2>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-kurator-muted">
                          <span>
                            {c.item_count} {c.item_count === 1 ? "item" : "items"}
                          </span>
                          {(() => {
                            const v = visibilityOf(c);
                            if (v === "followers") return null;
                            const Icon = v === "private" ? Lock : Users;
                            const label = v === "private" ? "Private" : "Friends";
                            return (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                                <Icon className="h-3 w-3" aria-hidden />
                                {label}
                              </span>
                            );
                          })()}
                        </p>
                      </div>
                    </div>
                    {c.description ? (
                      <p className="mt-3 line-clamp-3 text-sm text-kurator-muted">{c.description}</p>
                    ) : null}
                  </Link>
                  {c.author ? (
                    <div className="flex items-center border-t border-kurator-border/60 px-4 py-2">
                      <ShelfAuthorLink author={c.author} />
                    </div>
                  ) : null}
                </div>
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
