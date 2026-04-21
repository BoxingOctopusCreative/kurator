"use client";

import { useEffect, useState } from "react";
import {
  deleteList,
  deleteWishlist,
  type DeleteListOutcome,
  type DeleteWishlistOutcome,
  type EntryDeleteConflictPayload,
} from "@/lib/api";

export type EntryDeleteSubject = {
  id: string;
  name: string;
  entry_count: number;
};

type Props = {
  variant: "list" | "wishlist";
  subject: EntryDeleteSubject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
};

const COPY = {
  list: {
    title: "Delete List",
    entrySingular: "link",
    entryPlural: "links",
    loading: "Checking your other lists…",
    bodyWithEntries:
      "Move every link to another list you own, or discard links on this list only. Your items stay on their shelves either way.",
    moveLabel: "Move links to",
    movePlaceholder: "Select a list…",
    discardLabel:
      "Discard all links on this list (removes this list’s pointers only — does not delete items from collections)",
    emptyHint: "This list will be removed. Items on your shelves are unchanged.",
  },
  wishlist: {
    title: "Delete Wishlist",
    entrySingular: "entry",
    entryPlural: "entries",
    loading: "Checking your other wishlists…",
    bodyWithEntries:
      "Copy every entry to another wishlist you own, or discard entries here. Discarding permanently removes those wished items.",
    moveLabel: "Copy entries to",
    movePlaceholder: "Select a wishlist…",
    discardLabel: "Discard all entries on this wishlist permanently (cannot be undone)",
    emptyHint: "This wishlist will be removed.",
  },
} as const;

export function DeleteEntryBucketDialog({ variant, subject, open, onOpenChange, onDeleted }: Props) {
  const c = COPY[variant];
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState<EntryDeleteConflictPayload | null>(null);
  const [moveToId, setMoveToId] = useState("");
  const [discard, setDiscard] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [probeSaysEmpty, setProbeSaysEmpty] = useState(false);

  useEffect(() => {
    if (!open || !subject) return;
    setLoadErr(null);
    setSubmitErr(null);
    setMoveToId("");
    setDiscard(false);
    setProbeSaysEmpty(false);
    if (subject.entry_count <= 0) {
      setConflict(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setConflict(null);
    const probe =
      variant === "list"
        ? () => deleteList(subject.id, {})
        : () => deleteWishlist(subject.id, {});
    void probe()
      .then((out: DeleteListOutcome | DeleteWishlistOutcome) => {
        if (cancelled) return;
        if (out.ok) {
          setProbeSaysEmpty(true);
          setConflict(null);
        } else if ("conflict" in out) {
          setConflict(out.conflict);
        } else {
          setLoadErr(out.message);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, subject?.id, subject?.entry_count, variant]);

  if (!subject) return null;

  async function onConfirmDelete() {
    const s = subject;
    if (!s) return;
    setSubmitErr(null);
    const hasEntries = s.entry_count > 0 && !probeSaysEmpty;
    if (hasEntries && !moveToId.trim() && !discard) {
      setSubmitErr(
        variant === "list"
          ? "Choose another list for your links, or discard links on this list."
          : "Choose another wishlist for your entries, or discard them permanently."
      );
      return;
    }
    if (hasEntries && moveToId.trim() && discard) {
      setSubmitErr("Choose only one: move or discard.");
      return;
    }
    setBusy(true);
    try {
      const out =
        variant === "list"
          ? await deleteList(s.id, {
              ...(moveToId.trim() ? { move_entries_to: moveToId.trim() } : {}),
              ...(discard ? { discard_entries: true } : {}),
            })
          : await deleteWishlist(s.id, {
              ...(moveToId.trim() ? { move_entries_to: moveToId.trim() } : {}),
              ...(discard ? { discard_entries: true } : {}),
            });
      if (out.ok) {
        onOpenChange(false);
        onDeleted();
        return;
      }
      if ("conflict" in out) {
        setSubmitErr("Could not delete. Try again.");
        setConflict(out.conflict);
        return;
      }
      setSubmitErr(out.message);
    } finally {
      setBusy(false);
    }
  }

  const hasEntries = subject.entry_count > 0 && !probeSaysEmpty;
  const submitDisabled = busy || (hasEntries && !discard && !moveToId.trim());

  const dialogTitleId = `delete-${variant}-title`;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) onOpenChange(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-kurator-border bg-kurator-surface p-5 shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={dialogTitleId} className="text-lg font-semibold text-kurator-fg">
              {c.title}
            </h2>
            <p className="mt-2 text-sm text-kurator-muted">
              <span className="font-medium text-kurator-fg">“{subject.name}”</span>
              {hasEntries
                ? ` has ${subject.entry_count} ${subject.entry_count === 1 ? c.entrySingular : c.entryPlural}.`
                : ` has no ${c.entryPlural}.`}
            </p>

            {hasEntries && busy && !conflict && !loadErr && (
              <p className="mt-4 text-sm text-kurator-muted">{c.loading}</p>
            )}

            {loadErr && (
              <p className="mt-4 text-sm text-amber-200/90" role="alert">
                {loadErr}
              </p>
            )}

            {hasEntries && conflict && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-kurator-fg">{c.bodyWithEntries}</p>
                {conflict.eligible_move_targets.length > 0 ? (
                  <label className="block text-sm">
                    <span className="text-kurator-muted">{c.moveLabel}</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                      value={moveToId}
                      onChange={(e) => {
                        setMoveToId(e.target.value);
                        setDiscard(false);
                      }}
                      disabled={busy}
                    >
                      <option value="">{c.movePlaceholder}</option>
                      {conflict.eligible_move_targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm text-kurator-muted">
                    {variant === "list"
                      ? "You have no other list to merge into. Discard links below, or create another list first."
                      : "You have no other wishlist to copy into. Discard entries below, or create another wishlist first."}
                  </p>
                )}
                <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-muted">
                  <input
                    type="checkbox"
                    className="mt-1 rounded-sm border-kurator-border"
                    checked={discard}
                    onChange={(e) => {
                      setDiscard(e.target.checked);
                      if (e.target.checked) setMoveToId("");
                    }}
                    disabled={busy}
                  />
                  <span>{c.discardLabel}</span>
                </label>
              </div>
            )}

            {!hasEntries && <p className="mt-4 text-sm text-kurator-muted">{c.emptyHint}</p>}

            {submitErr && (
              <p className="mt-4 text-sm text-amber-200/90" role="alert">
                {submitErr}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-kurator-border bg-kurator-bg px-4 py-2 text-sm text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitDisabled}
                onClick={() => void onConfirmDelete()}
                className="rounded-lg bg-red-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {busy ? "Working…" : c.title}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
