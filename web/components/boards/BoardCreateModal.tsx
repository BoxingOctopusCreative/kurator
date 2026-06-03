"use client";

import { useEffect, useState } from "react";
import {
  createBoard,
  fetchMyFriends,
  suggestBoardSlug,
  type BoardVisibility,
  type PublicUser,
} from "@/lib/api";
import { FriendCheckboxRow } from "@/components/FriendCheckboxRow";
import { KuratorModal } from "@/components/KuratorModal";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import { assertCollectionOrWishlistName, assertLooseMultilineText, LIMITS } from "@/lib/validation";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (slug: string) => void;
};

export function BoardCreateModal({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<BoardVisibility>("public");
  const [slug, setSlug] = useState("");
  const [slugSuggesting, setSlugSuggesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [inviteFriendIds, setInviteFriendIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setFormMsg(null);
  }, [open]);

  useEffect(() => {
    if (!open || visibility !== "public" || slug.trim() !== "") return;
    let cancelled = false;
    const stem = name.trim() || "board";
    void suggestBoardSlug({ stem })
      .then((sug) => {
        if (!cancelled) setSlug(sug.slug);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, visibility, slug, name]);

  useEffect(() => {
    if (!user || visibility !== "private" || !open) {
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
  }, [user, visibility, open]);

  async function onSuggestSlug() {
    setSlugSuggesting(true);
    try {
      const sug = await suggestBoardSlug({ stem: name.trim() || "board", alternate: true });
      setSlug(sug.slug);
    } catch {
      /* ignore */
    } finally {
      setSlugSuggesting(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setFormMsg(null);
    setCreating(true);
    try {
      const boardName = assertCollectionOrWishlistName(name, "Board name");
      const desc = assertLooseMultilineText(description, LIMITS.description, "Description");
      const inviteIds =
        visibility === "private" ? Array.from(inviteFriendIds) : undefined;
      const b = await createBoard({
        name: boardName,
        description: desc,
        visibility,
        slug: visibility === "public" ? slug.trim() || undefined : undefined,
        invite_user_ids: inviteIds?.length ? inviteIds : undefined,
      });
      onOpenChange(false);
      setName("");
      setDescription("");
      setSlug("");
      setInviteFriendIds(new Set());
      onCreated(b.slug);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create board.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <KuratorModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create Board"
      panelClassName="max-w-lg w-[min(100%,32rem)]"
    >
      <form onSubmit={(e) => void onCreate(e)} className="space-y-4">
        <label className="block text-sm">
          <span className="text-kurator-muted">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-kurator-fg"
            required
            maxLength={LIMITS.name}
          />
        </label>
        <div className="block text-sm">
          <span className="text-kurator-muted">Description (optional)</span>
          <div className="mt-1">
            <MarkdownRichEditor
              value={description}
              onChange={setDescription}
              variant="full"
              allowImages
              disabled={creating}
              placeholder="What is this board about? Markdown, links, and images supported."
              aria-label="Board description"
            />
          </div>
        </div>
        <fieldset className="text-sm">
          <legend className="text-kurator-muted">Visibility</legend>
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="board-vis"
                checked={visibility === "public"}
                onChange={() => setVisibility("public")}
              />
              <span className="text-kurator-fg">Public — anyone signed in can read and post</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="board-vis"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
              />
              <span className="text-kurator-fg">Private — invite-only members</span>
            </label>
          </div>
        </fieldset>
        {visibility === "public" ? (
          <label className="block text-sm">
            <span className="text-kurator-muted">URL slug</span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg"
                placeholder="my-board"
              />
              <button
                type="button"
                onClick={() => void onSuggestSlug()}
                disabled={slugSuggesting}
                className="shrink-0 rounded-lg border border-kurator-border px-3 py-2 text-xs text-kurator-muted hover:bg-kurator-border/30"
              >
                {slugSuggesting ? "…" : "Suggest"}
              </button>
            </div>
          </label>
        ) : null}
        {visibility === "private" ? (
          <div className="text-sm">
            <p className="text-kurator-muted">Invite mutual friends (optional)</p>
            {friendsLoading ? (
              <p className="mt-2 text-xs text-kurator-muted">Loading friends…</p>
            ) : friends.length === 0 ? (
              <p className="mt-2 text-xs text-kurator-muted">No mutual friends to invite yet.</p>
            ) : (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {friends.map((f) => (
                  <li key={f.id}>
                    <FriendCheckboxRow
                      user={f}
                      checked={inviteFriendIds.has(f.id)}
                      onCheckedChange={() => {
                        setInviteFriendIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.id)) next.delete(f.id);
                          else next.add(f.id);
                          return next;
                        });
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {formMsg ? <p className="text-sm text-red-500">{formMsg}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-kurator-border px-4 py-2 text-sm text-kurator-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Board"}
          </button>
        </div>
      </form>
    </KuratorModal>
  );
}
