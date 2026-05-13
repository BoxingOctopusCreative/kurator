"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ListOrdered, Lock, Trash2, Users } from "lucide-react";
import {
  createList,
  DEFAULT_VISIBILITY,
  fetchLists,
  fetchMyFriends,
  type List,
  type PublicUser,
  type Visibility,
  visibilityOf,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { DeleteEntryBucketDialog, type EntryDeleteSubject } from "@/components/DeleteEntryBucketDialog";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { VisibilitySelect } from "@/components/VisibilitySelect";
import { assertCollectionOrWishlistName, assertLooseMultilineText, LIMITS } from "@/lib/validation";

export function ListsBrowser() {
  const { user } = useAuth();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [deleteSubject, setDeleteSubject] = useState<EntryDeleteSubject | null>(null);
  const [newIsShared, setNewIsShared] = useState(false);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [inviteFriendIds, setInviteFriendIds] = useState<Set<number>>(() => new Set());

  function reload() {
    setLoading(true);
    setError(null);
    fetchLists()
      .then(setLists)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load lists."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!user || !newIsShared) {
      setFriends([]);
      return;
    }
    let cancelled = false;
    setFriendsLoading(true);
    fetchMyFriends({ limit: 200 })
      .then((r) => {
        if (!cancelled) setFriends(r.items);
      })
      .catch(() => {
        if (!cancelled) setFriends([]);
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, newIsShared]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setCreating(true);
    try {
      const name = assertCollectionOrWishlistName(newName, "List name");
      const descRaw = newDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(newDesc, LIMITS.description, "Description")
        : undefined;
      await createList({
        name,
        description,
        visibility: newVisibility,
        is_public: newVisibility !== "private",
        is_shared: newIsShared ? true : undefined,
        invite_user_ids:
          newIsShared && inviteFriendIds.size > 0 ? Array.from(inviteFriendIds) : undefined,
      });
      setNewName("");
      setNewDesc("");
      setNewVisibility(DEFAULT_VISIBILITY);
      setNewIsShared(false);
      setInviteFriendIds(new Set());
      setFormMsg("List created.");
      reload();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create list.");
    } finally {
      setCreating(false);
    }
  }

  function isMyList(lst: List): boolean {
    return Boolean(user && Number(lst.user_id) === Number(user.id));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <DeleteEntryBucketDialog
        variant="list"
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
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Lists</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Curated picks from your collections — favourites, themes, or anything you group across categories.
            Choose Followers to share with people who follow you, or Friends only for mutuals.
          </p>
        </header>
      </PageHeroUnsplash>

      <form
        onSubmit={onCreate}
        className="mb-10 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-4 md:p-6"
      >
        <h2 className="kurator-panel-title text-kurator-fg">New List</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-kurator-muted">Name</span>
            <input
              required
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Favourites, 80s horror"
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
          <div className="md:col-span-2">
            <VisibilitySelect
              name="new-list-visibility"
              legend="Visibility"
              value={newVisibility}
              onChange={setNewVisibility}
            />
          </div>
          {user ? (
            <div className="md:col-span-2 space-y-3 rounded-lg border border-kurator-border/70 bg-kurator-bg/30 p-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-fg">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={newIsShared}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setNewIsShared(v);
                    if (!v) setInviteFriendIds(new Set());
                  }}
                />
                <span>
                  <span className="font-medium">Shared list</span>
                  <span className="mt-0.5 block text-xs text-kurator-muted">
                    Approved collaborators can add or remove items. Others can request to join from the list page.
                  </span>
                </span>
              </label>
              {newIsShared ? (
                <div>
                  <p className="text-xs font-medium text-kurator-muted">Invite mutual friends (optional)</p>
                  {friendsLoading ? (
                    <p className="mt-2 text-xs text-kurator-muted">Loading friends…</p>
                  ) : friends.length === 0 ? (
                    <p className="mt-2 text-xs text-kurator-muted">No mutual friends to show.</p>
                  ) : (
                    <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-md border border-kurator-border/80 p-2">
                      {friends.map((f) => (
                        <li key={f.id}>
                          <label className="flex cursor-pointer items-center gap-2 text-xs text-kurator-fg">
                            <input
                              type="checkbox"
                              checked={inviteFriendIds.has(f.id)}
                              onChange={() => {
                                setInviteFriendIds((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(f.id)) n.delete(f.id);
                                  else n.add(f.id);
                                  return n;
                                });
                              }}
                            />
                            @{f.username}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create List"}
          </button>
          {formMsg && <p className="text-sm text-kurator-muted">{formMsg}</p>}
        </div>
      </form>

      {loading && <p className="text-sm text-kurator-muted">Loading lists…</p>}
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && lists.length === 0 && (
        <p className="rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          No lists yet. Create one above, then add items from your shelves.
        </p>
      )}

      {!loading && !error && lists.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((lst) => (
            <li key={lst.id} className="relative">
              {isMyList(lst) && (
                <button
                  type="button"
                  aria-label={`Delete List ${lst.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteSubject({
                      id: lst.id,
                      name: lst.name,
                      entry_count: lst.item_count,
                    });
                  }}
                  className="absolute right-2 top-2 z-10 rounded-lg bg-kurator-bg/95 p-2 text-kurator-muted shadow-sm transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-kurator-border bg-kurator-surface shadow-surface transition-colors hover:border-kurator-accent/50 hover:bg-kurator-bg/80">
                <Link href={`/lists/${lst.id}`} className="flex flex-1 flex-col p-4 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
                      {lst.cover_art_url ? (
                        <ItemCoverImage url={lst.cover_art_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-kurator-border/60 text-kurator-accent">
                          <ListOrdered className="h-5 w-5" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="kurator-shelf-tile-title font-medium text-kurator-fg">{lst.name}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-kurator-muted">
                        <span>
                          {lst.item_count} {lst.item_count === 1 ? "item" : "items"}
                        </span>
                        {user != null && lst.user_id !== user.id && (
                          <span className="rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                            Member
                          </span>
                        )}
                        {user != null &&
                          lst.user_id === user.id &&
                          (() => {
                            const v = visibilityOf(lst);
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
                  {lst.description ? (
                    <p className="mt-3 line-clamp-3 text-sm text-kurator-muted">{lst.description}</p>
                  ) : null}
                </Link>
                {lst.author ? (
                  <div className="flex items-center border-t border-kurator-border/60 px-4 py-2">
                    <ShelfAuthorLink author={lst.author} />
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
