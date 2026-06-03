"use client";

import { useEffect, useState } from "react";
import {
  addBoardModerators,
  fetchBoardModerators,
  fetchMyFriends,
  removeBoardModerator,
  type BoardModerator,
  type PublicUser,
} from "@/lib/api";
import { FriendCheckboxRow } from "@/components/FriendCheckboxRow";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";

type Props = {
  boardId: string;
};

export function BoardModeratorManager({ boardId }: Props) {
  const [moderators, setModerators] = useState<BoardModerator[]>([]);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [pickIds, setPickIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    const mods = await fetchBoardModerators(boardId);
    setModerators(mods);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchBoardModerators(boardId), fetchMyFriends({ limit: 200 })])
      .then(([mods, friendsRes]) => {
        if (cancelled) return;
        setModerators(mods);
        setFriends(friendsRes.items);
      })
      .catch(() => {
        if (!cancelled) {
          setModerators([]);
          setFriends([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const modIds = new Set(moderators.map((m) => m.user_id));
  const addableFriends = friends.filter((f) => !modIds.has(f.id));

  async function onAdd() {
    if (pickIds.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      await addBoardModerators(boardId, Array.from(pickIds));
      setPickIds(new Set());
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add moderators.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(userId: number) {
    setBusy(true);
    setErr(null);
    try {
      await removeBoardModerator(boardId, userId);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove moderator.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-kurator-fg">Moderators</h3>
      <p className="text-xs text-kurator-muted">
        Moderators can delete any thread or reply. Only mutual friends can be added.
      </p>
      {loading ? (
        <p className="text-xs text-kurator-muted">Loading…</p>
      ) : moderators.length === 0 ? (
        <p className="text-xs text-kurator-muted">No moderators yet.</p>
      ) : (
        <ul className="space-y-1">
          {moderators.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-2 rounded-lg border border-kurator-border/60 px-2 py-1.5"
            >
              {m.user ? (
                <ShelfAuthorLink author={m.user} variant="avatarAndName" />
              ) : (
                <span className="text-sm text-kurator-muted">User #{m.user_id}</span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRemove(m.user_id)}
                className="shrink-0 text-xs text-red-300/90 hover:text-red-200 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {addableFriends.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-kurator-muted">Add from friends</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-kurator-border/60 p-1">
            {addableFriends.map((f) => (
              <li key={f.id}>
                <FriendCheckboxRow
                  user={f}
                  checked={pickIds.has(f.id)}
                  onCheckedChange={() => {
                    setPickIds((prev) => {
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
          <button
            type="button"
            disabled={busy || pickIds.size === 0}
            onClick={() => void onAdd()}
            className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-fg hover:bg-kurator-border/30 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add moderators"}
          </button>
        </div>
      ) : null}
      {err ? (
        <p className="text-sm text-red-500" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
