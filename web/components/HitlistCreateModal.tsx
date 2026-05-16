"use client";

import { useEffect, useState } from "react";
import {
  createList,
  DEFAULT_VISIBILITY,
  fetchMyFriends,
  suggestHitlistSlug,
  type PublicUser,
  type Visibility,
} from "@/lib/api";
import { VisibilitySelect } from "@/components/VisibilitySelect";
import { assertCollectionOrWishlistName, assertLooseMultilineText, LIMITS } from "@/lib/validation";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function HitlistCreateModal({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [newIsShared, setNewIsShared] = useState(false);
  const [newEntriesNumbered, setNewEntriesNumbered] = useState(true);
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
      const name = assertCollectionOrWishlistName(newName, "List name");
      const descRaw = newDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(newDesc, LIMITS.description, "Description")
        : undefined;
      let slug: string | undefined;
      if (newVisibility === "public") {
        const stem =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 48) || "hitlist";
        const sug = await suggestHitlistSlug({ stem });
        slug = sug.available ? sug.slug : (sug.suggested ?? sug.slug);
      }
      await createList({
        name,
        description,
        visibility: newVisibility,
        is_public: newVisibility !== "private",
        is_shared: newIsShared ? true : undefined,
        invite_user_ids:
          newIsShared && inviteFriendIds.size > 0 ? Array.from(inviteFriendIds) : undefined,
        slug,
        comments_enabled: true,
        entries_numbered: newEntriesNumbered,
      });
      setNewName("");
      setNewDesc("");
      setNewVisibility(DEFAULT_VISIBILITY);
      setNewIsShared(false);
      setNewEntriesNumbered(true);
      setInviteFriendIds(new Set());
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create list.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  const dialogTitleId = "hitlist-create-modal-title";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !creating) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-kurator-border bg-kurator-surface p-5 shadow-dropdown"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={dialogTitleId} className="kurator-panel-title text-kurator-fg">
          New hitlist
        </h2>
        <p className="mt-1 text-xs text-kurator-muted">
          Curate picks from your shelves. Public hitlists get a shareable permalink.
        </p>
        <form onSubmit={(e) => void onCreate(e)} className="mt-4 space-y-4">
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
          <label className="block text-sm">
            <span className="text-kurator-muted">Description (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </label>
          <VisibilitySelect
            name="modal-create-hitlist-visibility"
            legend="Visibility"
            value={newVisibility}
            onChange={setNewVisibility}
          />
          <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-fg">
            <input
              type="checkbox"
              className="mt-1"
              checked={newEntriesNumbered}
              onChange={(e) => setNewEntriesNumbered(e.target.checked)}
            />
            <span>
              <span className="font-medium">Numbered entries</span>
              <span className="mt-0.5 block text-xs text-kurator-muted">
                Uncheck for an unordered list. You can change this in hitlist settings.
              </span>
            </span>
          </label>
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
                  <span className="font-medium">Shared list</span>
                  <span className="mt-0.5 block text-xs text-kurator-muted">
                    Collaborators you approve can add or remove items.
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
              {creating ? "Creating…" : "Create hitlist"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
