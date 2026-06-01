"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import type { PublicUser, Visibility } from "@/lib/api";
import { createWishlist, DEFAULT_VISIBILITY, fetchMyFriends } from "@/lib/api";
import { KuratorModal } from "@/components/KuratorModal";
import { useAuth } from "@/components/AuthProvider";
import { useOnboardingTarget } from "@/components/onboarding/useOnboardingTarget";
import { VisibilitySelect } from "@/components/VisibilitySelect";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  onCreatedShelf?: (wishlistId: string) => void;
  dismissible?: boolean;
  collectionOptions: { id: string; name: string }[];
};

export function WishlistCreateModal({
  open,
  onOpenChange,
  onCreated,
  onCreatedShelf,
  dismissible = true,
  collectionOptions,
}: Props) {
  const { user } = useAuth();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [targetCol, setTargetCol] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [newIsShared, setNewIsShared] = useState(false);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [inviteFriendIds, setInviteFriendIds] = useState<Set<number>>(() => new Set());
  const { ref: modalPanelRef } = useOnboardingTarget("wishlist-create-modal", open);

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
      const name = assertCollectionOrWishlistName(newName, "Wishlist name");
      const descRaw = newDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(newDesc, LIMITS.description, "Description")
        : undefined;
      const created = await createWishlist({
        name,
        description,
        target_collection_id: targetCol.trim() === "" ? undefined : targetCol.trim(),
        visibility: newVisibility,
        is_public: newVisibility !== "private",
        is_shared: newIsShared ? true : undefined,
        invite_user_ids:
          newIsShared && inviteFriendIds.size > 0 ? Array.from(inviteFriendIds) : undefined,
      });
      onCreatedShelf?.(created.id);
      setNewName("");
      setNewDesc("");
      setTargetCol("");
      setNewVisibility(DEFAULT_VISIBILITY);
      setNewIsShared(false);
      setInviteFriendIds(new Set());
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create wishlist.");
    } finally {
      setCreating(false);
    }
  }

  const dialogTitleId = "wishlist-create-modal-title";

  return (
    <KuratorModal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={dismissible && !creating}
      overlayClassName="bg-black/50"
      showHeader={false}
      labelledBy={dialogTitleId}
    >
      <div ref={modalPanelRef}>
        <h2 id={dialogTitleId} className="kurator-panel-title text-kurator-fg">
          New wishlist
        </h2>
        <p className="mt-1 text-xs text-kurator-muted">
          Track what you want. Link a collection so items land on the right shelf when you get them.
        </p>
        <form onSubmit={(e) => void onCreate(e)} className="mt-4 space-y-4">
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
          <label className="block text-sm">
            <span className="text-kurator-muted">Description (optional)</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <div className="group relative inline-flex items-center gap-1.5">
              <span className="text-kurator-muted">Link to collection (optional)</span>
              <button
                type="button"
                className="-m-0.5 inline-flex shrink-0 rounded-sm p-0.5 text-kurator-muted hover:text-kurator-fg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                aria-label='When set, “Add to collection” defaults to this shelf unless you pick another.'
              >
                <CircleHelp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-1.5 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              >
                When set, “Add to collection” defaults to this shelf unless you pick another.
              </span>
            </div>
            <select
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={targetCol}
              onChange={(e) => setTargetCol(e.target.value)}
            >
              <option value="">None (choose when you obtain each item)</option>
              {collectionOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <VisibilitySelect
            name="modal-new-wishlist-visibility"
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
                  <span className="font-medium">Shared wishlist</span>
                  <span className="mt-0.5 block text-xs text-kurator-muted">
                    Collaborators can add or remove wished items. Others can request to join from the wishlist
                    page.
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
              {creating ? "Creating…" : "Create wishlist"}
            </button>
          </div>
        </form>
      </div>
    </KuratorModal>
  );
}
