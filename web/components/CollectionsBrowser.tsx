"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Layers, Lock, Trash2, Users } from "lucide-react";
import type { Collection } from "@/lib/api";
import { fetchCollections, visibilityOf } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { useOnboardingOptional } from "@/components/onboarding/OnboardingProvider";
import { CollectionCreateModal } from "@/components/CollectionCreateModal";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { DeleteCollectionDialog, type DeleteCollectionSubject } from "@/components/DeleteCollectionDialog";
import { ItemCoverImage } from "@/components/ItemCoverImage";

export function CollectionsBrowser() {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onboarding = useOnboardingOptional();
  const [deleteSubject, setDeleteSubject] = useState<DeleteCollectionSubject | null>(null);

  function reload() {
    if (!user) return;
    setLoading(true);
    setError(null);
    fetchCollections({
      owner_user_id: user.id,
      sort: "name_asc",
      limit: 100,
      page: 1,
    })
      .then((res) => setCollections(res.items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load collections."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      setCollections([]);
      setLoading(false);
      setError(null);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when signed-in user identity is known
  }, [user]);

  return (
    <div>
      {onboarding?.active ? (
        <CollectionCreateModal
          open={onboarding.collectionCreateOpen}
          onOpenChange={onboarding.setCollectionCreateOpen}
          dismissible={false}
          onCreated={() => reload()}
          onCreatedShelf={(collectionId) => onboarding.onShelfCreated("collection", collectionId)}
        />
      ) : null}
      <DeleteCollectionDialog
        collection={deleteSubject}
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
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Collections</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Your collections — shelves for what you own or have finished. Choose who can see each one: yourself
            only, your followers, or just mutuals.
          </p>
        </div>
      </PageHeroUnsplash>

      {user === undefined && <p className="text-sm text-kurator-muted">Loading collections…</p>}
      {user != null && loading && <p className="text-sm text-kurator-muted">Loading collections…</p>}
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && collections.length === 0 && (
        <p className="py-8 text-center text-sm text-kurator-muted">
          No collections yet. {!user ? "Sign in to create one." : "Use Create in the top bar to add one."}
        </p>
      )}

      {!loading && !error && collections.length > 0 && (
        <ul className="m-0 list-none divide-y divide-kurator-border p-0">
          {collections.map((c) => (
            <li key={c.id}>
              <div className="flex items-start gap-2 py-4 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/collections/${c.id}`}
                    className="flex items-start gap-3 rounded-lg outline-hidden transition-colors hover:bg-kurator-border/25 focus-visible:ring-2 focus-visible:ring-kurator-accent -mx-2 px-2 py-0.5 sm:-mx-3 sm:px-3"
                  >
                    <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-md bg-kurator-border/40">
                      {c.cover_art_url ? (
                        <ItemCoverImage url={c.cover_art_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-kurator-accent">
                          <Layers className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="kurator-shelf-tile-title font-medium text-kurator-fg">{c.name}</h2>
                      {c.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-kurator-muted">{c.description}</p>
                      ) : null}
                    </div>
                  </Link>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ps-14 text-xs text-kurator-muted">
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
                <button
                  type="button"
                  aria-label={`Delete Collection ${c.name}`}
                  onClick={() =>
                    setDeleteSubject({ id: c.id, name: c.name, item_count: c.item_count })
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
