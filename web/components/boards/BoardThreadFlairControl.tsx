"use client";

import { useState } from "react";
import { patchBoardThreadFlair, type BoardFlair, type BoardThread } from "@/lib/api";
import { BoardFlairBadge } from "@/components/boards/BoardFlairBadge";

type Props = {
  boardId: string;
  thread: BoardThread;
  flairs: BoardFlair[];
  onUpdated: (thread: BoardThread) => void;
};

export function BoardThreadFlairControl({ boardId, thread, flairs, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!thread.may_set_flair) {
    return thread.flair_label ? <BoardFlairBadge label={thread.flair_label} /> : null;
  }

  if (flairs.length === 0) {
    return (
      <div className="text-xs text-kurator-muted">
        {thread.flair_label ? <BoardFlairBadge label={thread.flair_label} /> : null}
        <span className={thread.flair_label ? "ml-2" : ""}>
          No flair tags on this board yet. The board owner can add them.
        </span>
      </div>
    );
  }

  async function onChange(flairId: string) {
    setBusy(true);
    setErr(null);
    try {
      const nextId = flairId === "" ? null : flairId;
      const updated = await patchBoardThreadFlair(boardId, thread.id, nextId);
      onUpdated(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update flair.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-kurator-muted" htmlFor={`thread-flair-${thread.id}`}>
        Flair
      </label>
      <select
        id={`thread-flair-${thread.id}`}
        value={thread.flair_id ?? ""}
        disabled={busy}
        onChange={(e) => void onChange(e.target.value)}
        className="rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1 text-xs text-kurator-fg"
      >
        <option value="">None</option>
        {flairs.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      {thread.flair_label ? <BoardFlairBadge label={thread.flair_label} /> : null}
      {err ? <span className="text-xs text-red-500">{err}</span> : null}
    </div>
  );
}
