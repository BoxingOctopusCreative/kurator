"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, Lock, Trash2, Users } from "lucide-react";
import {
  collectionMayReceiveItems,
  fetchCollections,
  fetchWishlists,
  visibilityOf,
  type Wishlist,
} from "@/lib/api";
import {
  type WishlistsListFilters,
  filterWishlistsByQuery,
  parseWishlistsListSearchString,
  stringifyWishlistsListFilters,
} from "@/lib/wishlistsListUrl";
import { useAuth } from "@/components/AuthProvider";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { DeleteEntryBucketDialog, type EntryDeleteSubject } from "@/components/DeleteEntryBucketDialog";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { WishlistCreateModal } from "@/components/WishlistCreateModal";
import { useOnboardingOptional } from "@/components/onboarding/OnboardingProvider";
import { useOnboardingTarget } from "@/components/onboarding/useOnboardingTarget";

const WISHLISTS_BASE_PATH = "/wishlists";

type Props = {
  initialFilters: WishlistsListFilters;
};

export function WishlistsBrowser({ initialFilters }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [filterState, setFilterState] = useState<WishlistsListFilters>(initialFilters);
  const [qInput, setQInput] = useState(initialFilters.q);
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [createOpenLocal, setCreateOpenLocal] = useState(false);
  const onboarding = useOnboardingOptional();
  const createOpen = onboarding?.active ? onboarding.wishlistCreateOpen : createOpenLocal;
  const setCreateOpen = onboarding?.active ? onboarding.setWishlistCreateOpen : setCreateOpenLocal;
  const { ref: createButtonRef } = useOnboardingTarget("wishlist-create", Boolean(onboarding?.active && onboarding.step === 4));
  const [deleteSubject, setDeleteSubject] = useState<EntryDeleteSubject | null>(null);

  const commitFilters = useCallback((next: WishlistsListFilters | ((prev: WishlistsListFilters) => WishlistsListFilters)) => {
    setFilterState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      const qs = stringifyWishlistsListFilters(resolved);
      const url = qs ? `${WISHLISTS_BASE_PATH}?${qs}` : WISHLISTS_BASE_PATH;
      window.history.replaceState(window.history.state, "", url);
      return resolved;
    });
  }, []);

  function reload() {
    setLoading(true);
    setError(null);
    fetchWishlists()
      .then(setWishlists)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load wishlists."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = parseWishlistsListSearchString(window.location.search);
      setFilterState(next);
      setQInput(next.q);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = qInput.trim();
      if (trimmed !== filterState.q.trim()) {
        commitFilters({ q: trimmed });
        setQInput(trimmed);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, filterState.q, commitFilters]);

  const visibleWishlists = useMemo(
    () => filterWishlistsByQuery(wishlists, filterState.q),
    [wishlists, filterState.q],
  );

  useEffect(() => {
    let cancelled = false;
    fetchCollections({ limit: 100, sort: "name_asc" })
      .then((res) => {
        if (!cancelled)
          setCollections(
            res.items.filter(collectionMayReceiveItems).map((c) => ({ id: c.id, name: c.name })),
          );
      })
      .catch(() => {
        if (!cancelled) setCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onCreateClick() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(WISHLISTS_BASE_PATH)}`);
      return;
    }
    setCreateOpen(true);
  }

  function isMyWishlist(w: Wishlist): boolean {
    return Boolean(user && Number(w.user_id) === Number(user.id));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WishlistCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        dismissible={!onboarding?.active}
        collectionOptions={collections}
        onCreated={() => reload()}
        onCreatedShelf={(wishlistId) => onboarding?.onShelfCreated("wishlist", wishlistId)}
      />
      <DeleteEntryBucketDialog
        variant="wishlist"
        subject={deleteSubject}
        open={deleteSubject != null}
        onOpenChange={(v) => {
          if (!v) setDeleteSubject(null);
        }}
        onDeleted={() => {
          setDeleteSubject(null);
          reload();
        }}
      />
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Wishlists</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Track what you want. Choose who can see each wishlist: yourself only, your followers, or just mutuals.
            Link a wishlist to a collection so items move to the right shelf when you get them.
          </p>
        </div>
      </PageHeroUnsplash>

      <div className="mb-6 flex flex-col gap-4 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <p className="text-sm text-kurator-muted">
            {user
              ? "Wishlists you own and shared lists you collaborate on appear below."
              : "Sign in to create wishlists and link them to collections."}
          </p>
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
          </div>
        </div>
        <button
          ref={createButtonRef}
          type="button"
          onClick={onCreateClick}
          className="inline-flex w-full shrink-0 items-center justify-center rounded-lg bg-kurator-accent px-4 py-2 text-sm font-semibold text-kurator-onAccent hover:opacity-90 md:ms-4 md:w-auto md:self-end"
        >
          Create Your Own!
        </button>
      </div>

      {loading && <p className="text-sm text-kurator-muted">Loading wishlists…</p>}
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && wishlists.length === 0 && (
        <p className="rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          No wishlists yet. {!user ? "Sign in to create one." : "Create one with Create Your Own!"}
        </p>
      )}

      {!loading && !error && wishlists.length > 0 && visibleWishlists.length === 0 && (
        <p className="rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          No wishlists match your search.
        </p>
      )}

      {!loading && !error && visibleWishlists.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleWishlists.map((w) => (
            <li key={w.id} className="relative">
              {isMyWishlist(w) && (
                <button
                  type="button"
                  aria-label={`Delete Wishlist ${w.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteSubject({
                      id: w.id,
                      name: w.name,
                      entry_count: w.entry_count,
                    });
                  }}
                  className="absolute right-2 top-2 z-10 rounded-lg bg-kurator-bg/95 p-2 text-kurator-muted shadow-sm transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-kurator-border bg-kurator-surface shadow-surface transition-colors hover:border-kurator-accent/50 hover:bg-kurator-bg/80">
                <Link href={`/wishlists/${w.id}`} className="flex flex-1 flex-col p-4 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
                      {w.cover_art_url ? (
                        <ItemCoverImage url={w.cover_art_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-kurator-border/60 text-kurator-accent">
                          <Heart className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="kurator-shelf-tile-title font-medium text-kurator-fg">{w.name}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-kurator-muted">
                        <span>
                          {w.entry_count} {w.entry_count === 1 ? "item" : "items"} wished
                        </span>
                        {user != null && w.user_id !== user.id && (
                          <span className="rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                            Member
                          </span>
                        )}
                        {user != null &&
                            w.user_id === user.id &&
                            (() => {
                              const v = visibilityOf(w);
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
                  {w.description ? (
                    <p className="mt-3 line-clamp-3 text-sm text-kurator-muted">{w.description}</p>
                  ) : null}
                </Link>
                {w.author ? (
                  <div className="flex items-center border-t border-kurator-border/60 px-4 py-2">
                    <ShelfAuthorLink author={w.author} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
