"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import type { Category, PublicUser, Visibility } from "@/lib/api";
import { createCollection, DEFAULT_VISIBILITY, fetchMyFriends } from "@/lib/api";
import { KuratorModal } from "@/components/KuratorModal";
import { useAuth } from "@/components/AuthProvider";
import { VisibilitySelect } from "@/components/VisibilitySelect";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function CollectionCreateModal({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [newShelfCategory, setNewShelfCategory] = useState<Category>("game");
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [newIsShared, setNewIsShared] = useState(false);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [inviteFriendIds, setInviteFriendIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setFormMsg(null);
  }, [open]);

  useEffect(() => {
    if (!user || !newIsShared || !open) {
      if (!open) setFriends([]);
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
  }, [user, newIsShared, open]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setFormMsg(null);
    setCreating(true);
    try {
      const name = assertCollectionOrWishlistName(newName, "Collection name");
      const descRaw = newDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(newDesc, LIMITS.description, "Description")
        : undefined;
      await createCollection({
        name,
        description,
        visibility: newVisibility,
        is_public: newVisibility !== "private",
        category: newShelfCategory,
        is_shared: newIsShared ? true : undefined,
        invite_user_ids:
          newIsShared && inviteFriendIds.size > 0 ? Array.from(inviteFriendIds) : undefined,
      });
      setNewName("");
      setNewDesc("");
      setNewVisibility(DEFAULT_VISIBILITY);
      setNewShelfCategory("game");
      setNewIsShared(false);
      setInviteFriendIds(new Set());
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create collection.");
    } finally {
      setCreating(false);
    }
  }

  const dialogTitleId = "collection-create-modal-title";

  return (
    <KuratorModal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!creating}
      overlayClassName="bg-black/50"
      showHeader={false}
      labelledBy={dialogTitleId}
    >
        <div className="group relative inline-flex items-center gap-1.5">
          <h2 id={dialogTitleId} className="kurator-panel-title text-kurator-fg">
            New collection
          </h2>
          <button
            type="button"
            className="-m-0.5 inline-flex shrink-0 rounded-sm p-0.5 text-kurator-muted hover:text-kurator-fg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
            aria-label="New collection shelves appear in this list and in Add Item → Collection."
          >
            <CircleHelp className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-1.5 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
          >
            New collection shelves appear in this list and in Add Item → Collection.
          </span>
        </div>
        <p className="mt-1 text-xs text-kurator-muted">
          Choose visibility and shelf type. Shared collections let invited mutual friends collaborate.
        </p>
        <form onSubmit={(e) => void onCreate(e)} className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="text-kurator-muted">Name</span>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Graphic novels, Switch games"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Description (optional)</span>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short note about this shelf"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="group relative inline-flex items-center gap-1.5 text-kurator-muted">
              <span>Shelf type</span>
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
          <VisibilitySelect
            name="modal-new-collection-visibility"
            legend="Visibility"
            value={newVisibility}
            onChange={setNewVisibility}
          />
          {user ? (
            <div className="space-y-3 rounded-lg border border-kurator-border/70 bg-kurator-bg/30 p-3">
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
                  <span className="font-medium">Shared collection</span>
                  <span className="mt-0.5 block text-xs text-kurator-muted">
                    Collaborators you approve can add and edit items here. Others can request to join from the
                    collection page.
                  </span>
                </span>
              </label>
              {newIsShared ? (
                <div>
                  <p className="text-xs font-medium text-kurator-muted">Invite mutual friends (optional)</p>
                  {friendsLoading ? (
                    <p className="mt-2 text-xs text-kurator-muted">Loading friends…</p>
                  ) : friends.length === 0 ? (
                    <p className="mt-2 text-xs text-kurator-muted">
                      No mutual friends to show. Follow people who follow you back.
                    </p>
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
          {formMsg ? (
            <p className="text-sm text-amber-200/90" role="alert">
              {formMsg}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={creating}
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-kurator-border bg-kurator-bg px-4 py-2 text-sm text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !user}
              className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create collection"}
            </button>
          </div>
        </form>
    </KuratorModal>
  );
}
