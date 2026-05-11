"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleHelp, Heart, Lock, Trash2, Users } from "lucide-react";
import {
  createWishlist,
  DEFAULT_VISIBILITY,
  fetchCollections,
  fetchWishlists,
  type Visibility,
  visibilityOf,
  type Wishlist,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { DeleteEntryBucketDialog, type EntryDeleteSubject } from "@/components/DeleteEntryBucketDialog";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { VisibilitySelect } from "@/components/VisibilitySelect";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";

export function WishlistsBrowser() {
  const { user } = useAuth();
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [targetCol, setTargetCol] = useState<string>("");
  const [newVisibility, setNewVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [deleteSubject, setDeleteSubject] = useState<EntryDeleteSubject | null>(null);

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
    let cancelled = false;
    fetchCollections({ limit: 100, sort: "name_asc" })
      .then((res) => {
        if (!cancelled) setCollections(res.items.map((c) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {
        if (!cancelled) setCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setCreating(true);
    try {
      const name = assertCollectionOrWishlistName(newName, "Wishlist name");
      const descRaw = newDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(newDesc, LIMITS.description, "Description")
        : undefined;
      await createWishlist({
        name,
        description,
        target_collection_id: targetCol.trim() === "" ? undefined : targetCol.trim(),
        visibility: newVisibility,
        is_public: newVisibility !== "private",
      });
      setNewName("");
      setNewDesc("");
      setTargetCol("");
      setNewVisibility(DEFAULT_VISIBILITY);
      setFormMsg("Wishlist created.");
      reload();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create wishlist.");
    } finally {
      setCreating(false);
    }
  }

  function isMyWishlist(w: Wishlist): boolean {
    return Boolean(user && Number(w.user_id) === Number(user.id));
  }

  return (
    <div className="mx-auto max-w-5xl">
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
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Wishlists</h1>
        <p className="mt-1 text-sm text-kurator-muted">
          Track what you want. Choose who can see each wishlist — yourself only, your followers, or just mutuals.
          Link a wishlist to a collection so items move to the right shelf when you get them.
        </p>
      </header>

      <form
        onSubmit={onCreate}
        className="mb-10 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 md:p-6"
      >
        <h2 className="text-sm font-medium text-kurator-fg">New Wishlist</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-kurator-muted">Name</span>
            <input
              required
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Vinyl to buy"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-kurator-muted">Description (Optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <div className="group relative inline-flex shrink-0 items-center gap-1.5">
                <span className="text-kurator-muted">Link to Collection (Optional)</span>
                <button
                  type="button"
                  className="-m-0.5 inline-flex shrink-0 rounded-sm p-0.5 text-kurator-muted hover:text-kurator-fg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                  aria-label='When set, “Add to collection” defaults to this shelf unless you pick another.'
                >
                  <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none invisible absolute bottom-full left-0 z-60 mb-1.5 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                >
                  When set, “Add to collection” defaults to this shelf unless you pick another.
                </span>
              </div>
              <select
                className="w-full max-w-md rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 sm:min-w-0 sm:flex-1"
                value={targetCol}
                onChange={(e) => setTargetCol(e.target.value)}
              >
                <option value="">None — choose when you obtain each item</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <div className="md:col-span-2">
            <VisibilitySelect
              name="new-wishlist-visibility"
              legend="Visibility"
              value={newVisibility}
              onChange={setNewVisibility}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Wishlist"}
          </button>
          {formMsg && <p className="text-sm text-kurator-muted">{formMsg}</p>}
        </div>
      </form>

      {loading && <p className="text-sm text-kurator-muted">Loading wishlists…</p>}
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && wishlists.length === 0 && (
        <p className="rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          No wishlists yet. Create one above.
        </p>
      )}

      {!loading && !error && wishlists.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wishlists.map((w) => (
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
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-kurator-border bg-kurator-surface shadow-xs transition-colors hover:border-kurator-accent/50 hover:bg-kurator-bg/80">
                <Link href={`/wishlists/${w.id}`} className="flex flex-1 flex-col p-4 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-xs">
                      {w.cover_art_url ? (
                        <ItemCoverImage url={w.cover_art_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-kurator-border/60 text-kurator-accent">
                          <Heart className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium text-kurator-fg">{w.name}</h2>
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
