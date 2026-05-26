"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WishlistAddEntryModal } from "@/components/WishlistAddEntryModal";
import { useAuth } from "@/components/AuthProvider";
import {
  createItem,
  createWishlistEntry,
  collectionMayReceiveItems,
  fetchCollections,
  fetchWishlists,
  wishlistMayReceiveItems,
  type Collection,
  type HitlistEntry,
  type Wishlist,
} from "@/lib/api";
import { hitlistEntryCopyPayload } from "@/lib/hitlistEntryCopy";

type Props = {
  entry: HitlistEntry;
};

/** Below-entry action: link to source collection when the row is a shelved item; else “add to my account” for stubs/loose items. */
export function HitlistAddToAccountButton({ entry }: Props) {
  const shelfId = entry.item?.collection_id?.trim();
  if (shelfId) {
    return (
      <Link
        href={`/collections/${encodeURIComponent(shelfId)}`}
        className="rounded text-left text-xs font-medium text-kurator-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
      >
        View on shelf
      </Link>
    );
  }

  const { user } = useAuth();
  const payload = hitlistEntryCopyPayload(entry);
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState<"collection" | "wishlist">("collection");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [selId, setSelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const visibleCollections = useMemo(() => {
    if (!payload) return [];
    return collections.filter((c) => !c.category || c.category === payload.category);
  }, [collections, payload]);

  const editableWishlists = useMemo(
    () =>
      wishlists.filter(
        (w) =>
          wishlistMayReceiveItems(w) ||
          (user != null && Number(w.user_id) === Number(user.id)),
      ),
    [wishlists, user],
  );

  useEffect(() => {
    if (!open || !payload) return;
    setMsg(null);
    setSelId("");
    let cancelled = false;
    void Promise.all([
      fetchCollections({ limit: 200, sort: "name_asc" }).then((r) => {
        if (!cancelled) setCollections(r.items.filter(collectionMayReceiveItems));
      }),
      fetchWishlists().then((w) => {
        if (!cancelled) setWishlists(w);
      }),
    ]).catch(() => {
      if (!cancelled) setMsg("Could not load your shelves.");
    });
    return () => {
      cancelled = true;
    };
  }, [open, payload]);

  if (!payload) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payload) return;
    if (!selId.trim()) {
      setMsg("Choose a destination.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (dest === "collection") {
        await createItem({
          title: payload.title,
          category: payload.category,
          collection_id: selId.trim(),
          metadata: payload.metadata,
          rating: payload.sourceItem?.rating ?? undefined,
          consumption_status: payload.sourceItem?.consumption_status,
        });
      } else {
        await createWishlistEntry(selId.trim(), {
          title: payload.title,
          category: payload.category,
          metadata: payload.metadata,
        });
      }
      setOpen(false);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  }

  const selectKindClass =
    "mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded text-left text-xs font-medium text-kurator-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
      >
        Add this to my account
      </button>
      <WishlistAddEntryModal open={open} onOpenChange={setOpen} title="Add to your account">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <p className="text-xs text-kurator-muted">
            Save a copy of{" "}
            <span className="font-medium text-kurator-fg">{payload.title}</span> to one of your
            collections or wishlists. This does not change the hitlist.
          </p>
          <fieldset>
            <legend className="text-sm font-medium text-kurator-fg">Destination</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-kurator-fg">
                <input
                  type="radio"
                  name="hitlist-add-dest"
                  checked={dest === "collection"}
                  onChange={() => {
                    setDest("collection");
                    setSelId("");
                  }}
                />
                Collection
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-kurator-fg">
                <input
                  type="radio"
                  name="hitlist-add-dest"
                  checked={dest === "wishlist"}
                  onChange={() => {
                    setDest("wishlist");
                    setSelId("");
                  }}
                />
                Wishlist
              </label>
            </div>
          </fieldset>
          {dest === "collection" ? (
            <label className="block text-sm">
              <span className="text-kurator-muted">Collection</span>
              <select
                className={selectKindClass}
                value={selId}
                onChange={(e) => setSelId(e.target.value)}
                required
              >
                <option value="">Choose a collection…</option>
                {visibleCollections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name.trim() || "Untitled"}
                  </option>
                ))}
              </select>
              {visibleCollections.length === 0 ? (
                <span className="mt-1 block text-xs text-kurator-muted">
                  No collection matches this category.{" "}
                  <Link href="/collections" className="text-kurator-accent hover:underline">
                    Manage collections
                  </Link>
                </span>
              ) : null}
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-kurator-muted">Wishlist</span>
              <select
                className={selectKindClass}
                value={selId}
                onChange={(e) => setSelId(e.target.value)}
                required
              >
                <option value="">Choose a wishlist…</option>
                {editableWishlists.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name.trim() || "Untitled"}
                  </option>
                ))}
              </select>
              {editableWishlists.length === 0 ? (
                <span className="mt-1 block text-xs text-kurator-muted">
                  <Link href="/wishlists" className="text-kurator-accent hover:underline">
                    Create or open a wishlist
                  </Link>{" "}
                  you can edit.
                </span>
              ) : null}
            </label>
          )}
          {msg ? (
            <p className="text-sm text-red-400" role="alert">
              {msg}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={
              busy ||
              !selId.trim() ||
              (dest === "collection" && visibleCollections.length === 0) ||
              (dest === "wishlist" && editableWishlists.length === 0)
            }
            className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add copy"}
          </button>
        </form>
      </WishlistAddEntryModal>
    </>
  );
}
