"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Lock } from "lucide-react";
import {
  createWishlist,
  fetchCollections,
  fetchWishlists,
  type Wishlist,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
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
  const [collections, setCollections] = useState<{ id: number; name: string }[]>([]);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [targetCol, setTargetCol] = useState<number | "">("");
  const [newPublic, setNewPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

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
        target_collection_id:
          targetCol === "" || targetCol === 0 ? undefined : Number(targetCol),
        is_public: newPublic,
      });
      setNewName("");
      setNewDesc("");
      setTargetCol("");
      setNewPublic(true);
      setFormMsg("Wishlist created.");
      reload();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create wishlist.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Wishlists</h1>
        <p className="mt-1 text-sm text-kurator-muted">
          Track what you want. Public wishlists appear for other signed-in members; private ones are only yours.
          Link a list to a collection so items move to the right shelf when you get them.
        </p>
      </header>

      <form
        onSubmit={onCreate}
        className="mb-10 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 md:p-6"
      >
        <h2 className="text-sm font-medium text-kurator-fg">New wishlist</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-kurator-muted">Name</span>
            <input
              required
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Vinyl to buy"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-kurator-muted">Description (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-kurator-muted">Link to collection (optional)</span>
            <select
              className="mt-1 w-full max-w-md rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={targetCol === "" ? "" : String(targetCol)}
              onChange={(e) => {
                const v = e.target.value;
                setTargetCol(v === "" ? "" : Number(v));
              }}
            >
              <option value="">None — choose when you obtain each item</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-kurator-muted">
              When set, “Add to collection” defaults to this shelf unless you pick another.
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-kurator-muted md:col-span-2">
            <input
              type="checkbox"
              checked={newPublic}
              onChange={(e) => setNewPublic(e.target.checked)}
              className="rounded border-kurator-border"
            />
            Public (visible to other signed-in users)
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create wishlist"}
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
            <li key={w.id}>
              <Link
                href={`/wishlists/${w.id}`}
                className="flex h-full flex-col rounded-xl border border-kurator-border bg-kurator-surface p-4 shadow-sm transition-colors hover:border-kurator-accent/50 hover:bg-kurator-bg/80"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kurator-border/60 text-kurator-accent">
                    <Heart className="h-5 w-5" aria-hidden />
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
                      {user != null && w.user_id === user.id && w.is_public === false && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                          <Lock className="h-3 w-3" aria-hidden />
                          Private
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {w.description && (
                  <p className="mt-3 line-clamp-3 text-sm text-kurator-muted">{w.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
