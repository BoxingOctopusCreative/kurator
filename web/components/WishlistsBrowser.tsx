"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Lock, Trash2, Users } from "lucide-react";
import {
  collectionMayReceiveItems,
  fetchCollections,
  fetchWishlists,
  visibilityOf,
  type Wishlist,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { DeleteEntryBucketDialog, type EntryDeleteSubject } from "@/components/DeleteEntryBucketDialog";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { WishlistCreateModal } from "@/components/WishlistCreateModal";
import { useOnboardingOptional } from "@/components/onboarding/OnboardingProvider";

export function WishlistsBrowser() {
  const { user } = useAuth();
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const onboarding = useOnboardingOptional();
  const [deleteSubject, setDeleteSubject] = useState<EntryDeleteSubject | null>(null);

  function reload() {
    if (!user) return;
    setLoading(true);
    setError(null);
    fetchWishlists({ ownerUserId: user.id })
      .then(setWishlists)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load wishlists."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      setWishlists([]);
      setLoading(false);
      setError(null);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when signed-in user identity is known
  }, [user]);

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

  return (
    <div>
      {onboarding?.active ? (
        <WishlistCreateModal
          open={onboarding.wishlistCreateOpen}
          onOpenChange={onboarding.setWishlistCreateOpen}
          dismissible={false}
          collectionOptions={collections}
          onCreated={() => reload()}
          onCreatedShelf={(wishlistId) => onboarding.onShelfCreated("wishlist", wishlistId)}
        />
      ) : null}
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
            Your wishlists — track what you want and choose who can see each one. Link a wishlist to a collection
            so items move to the right shelf when you get them.
          </p>
        </div>
      </PageHeroUnsplash>

      {user === undefined && <p className="text-sm text-kurator-muted">Loading wishlists…</p>}
      {user != null && loading && <p className="text-sm text-kurator-muted">Loading wishlists…</p>}
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && wishlists.length === 0 && (
        <p className="py-8 text-center text-sm text-kurator-muted">
          No wishlists yet. {!user ? "Sign in to create one." : "Use Create in the top bar to add one."}
        </p>
      )}

      {!loading && !error && wishlists.length > 0 && (
        <ul className="m-0 list-none divide-y divide-kurator-border p-0">
          {wishlists.map((w) => (
            <li key={w.id}>
              <div className="flex items-start gap-2 py-4 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/wishlists/${w.id}`}
                    className="flex items-start gap-3 rounded-lg outline-hidden transition-colors hover:bg-kurator-border/25 focus-visible:ring-2 focus-visible:ring-kurator-accent -mx-2 px-2 py-0.5 sm:-mx-3 sm:px-3"
                  >
                    <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-md bg-kurator-border/40">
                      {w.cover_art_url ? (
                        <ItemCoverImage url={w.cover_art_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-kurator-accent">
                          <Heart className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="kurator-shelf-tile-title font-medium text-kurator-fg">{w.name}</h2>
                      {w.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-kurator-muted">{w.description}</p>
                      ) : null}
                    </div>
                  </Link>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ps-14 text-xs text-kurator-muted">
                    <span>
                      {w.entry_count} {w.entry_count === 1 ? "item" : "items"} wished
                    </span>
                    {(() => {
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
                <button
                  type="button"
                  aria-label={`Delete Wishlist ${w.name}`}
                  onClick={() =>
                    setDeleteSubject({
                      id: w.id,
                      name: w.name,
                      entry_count: w.entry_count,
                    })
                  }
                  className="shrink-0 rounded-lg p-2 text-kurator-muted transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
