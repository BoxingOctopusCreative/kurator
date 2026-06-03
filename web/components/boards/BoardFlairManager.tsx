"use client";

import { useState } from "react";
import { createBoardFlair, deleteBoardFlair, type BoardFlair } from "@/lib/api";
import { BoardFlairBadge } from "@/components/boards/BoardFlairBadge";

type Props = {
  boardId: string;
  flairs: BoardFlair[];
  onChange: () => void;
};

export function BoardFlairManager({ boardId, flairs, onChange }: Props) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setErr(null);
    try {
      await createBoardFlair(boardId, trimmed);
      setLabel("");
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add flair.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(flairId: string) {
    setBusy(true);
    setErr(null);
    try {
      await deleteBoardFlair(boardId, flairId);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove flair.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-kurator-fg">Flair tags</h3>
      <p className="text-xs text-kurator-muted">
        Define tags thread authors can assign after posting (like Reddit post flair).
      </p>
      <form onSubmit={(e) => void onAdd(e)} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Discussion, Question"
          maxLength={64}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-sm text-kurator-fg"
        />
        <button
          type="submit"
          disabled={busy || label.trim() === ""}
          className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs font-medium text-kurator-fg hover:bg-kurator-border/30 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}
      {flairs.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {flairs.map((f) => (
            <li key={f.id} className="flex items-center gap-1">
              <BoardFlairBadge label={f.label} />
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRemove(f.id)}
                className="rounded px-1 text-xs text-kurator-muted hover:bg-kurator-border/40 hover:text-kurator-fg"
                aria-label={`Remove flair ${f.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-kurator-muted">No flair tags yet.</p>
      )}
    </div>
  );
}
