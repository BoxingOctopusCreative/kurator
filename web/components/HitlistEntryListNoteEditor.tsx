"use client";

import { useState } from "react";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import type { HitlistEntry } from "@/lib/api";
import { patchHitlistEntryDescription } from "@/lib/api";

type Props = {
  listId: string;
  entry: HitlistEntry;
  onUpdated: (entryId: string, description: string | null) => void;
};

/** Edit the hitlist-only markdown note for a row linked to a shelf item (does not edit the item). */
export function HitlistEntryListNoteEditor({ listId, entry, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Per-list blurbs for shelf-linked rows only: loose items already use the item’s own fields.
  const itemOnShelf =
    entry.item != null && Boolean(entry.item.collection_id?.trim());
  if (!itemOnShelf) {
    return null;
  }

  const hasRowNote = Boolean(entry.description?.trim());

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await patchHitlistEntryDescription(listId, entry.id, draft);
      const norm = draft.trim();
      onUpdated(entry.id, norm === "" ? null : norm);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setDraft(entry.description ?? "");
            setErr(null);
            setOpen(true);
          }}
          className="text-kurator-accent hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
        >
          {hasRowNote ? "Edit list note" : "Add list note"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-2 rounded-lg border border-kurator-border/80 bg-kurator-bg/40 p-2">
      <MarkdownRichEditor
        value={draft}
        onChange={setDraft}
        variant="compact"
        disabled={busy}
        placeholder="Note for this spot on the list only (markdown)…"
        aria-label="Hitlist row note"
      />
      {err ? <p className="text-xs text-red-200">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-md bg-kurator-accent px-2 py-1 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
          className="rounded-md border border-kurator-border px-2 py-1 text-xs text-kurator-fg hover:bg-kurator-border/30"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
