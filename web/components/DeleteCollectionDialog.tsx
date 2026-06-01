"use client";

import { useEffect, useState } from "react";
import type { Category } from "@/lib/api";
import { deleteCollection, type CollectionDeleteConflictPayload } from "@/lib/api";
import { KuratorModal } from "@/components/KuratorModal";
import { categoryLabel } from "@/lib/categoryLabels";

export type DeleteCollectionSubject = {
  id: string;
  name: string;
  item_count: number;
};

function targetSubtitle(category?: Category): string {
  if (category) return categoryLabel(category);
  return "Any category";
}

type Props = {
  collection: DeleteCollectionSubject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the API successfully removed the shelf (navigate or refresh lists). */
  onDeleted: () => void;
};

export function DeleteCollectionDialog({ collection, open, onOpenChange, onDeleted }: Props) {
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState<CollectionDeleteConflictPayload | null>(null);
  const [moveToId, setMoveToId] = useState("");
  const [deleteItemsPermanently, setDeleteItemsPermanently] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  /** Server had no items while props still showed items (race); treat shelf as empty for this dialog. */
  const [probeSaysEmpty, setProbeSaysEmpty] = useState(false);

  useEffect(() => {
    if (!open || !collection) {
      return;
    }
    setLoadErr(null);
    setSubmitErr(null);
    setMoveToId("");
    setDeleteItemsPermanently(false);
    setProbeSaysEmpty(false);
    if (collection.item_count <= 0) {
      setConflict(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setConflict(null);
    void deleteCollection(collection.id, {})
      .then((out) => {
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
  }, [open, collection?.id, collection?.item_count]);

  if (!collection) return null;

  async function onConfirmDelete() {
    const coll = collection;
    if (!coll) return;
    setSubmitErr(null);
    const hasItems = coll.item_count > 0;
    if (hasItems && !moveToId.trim() && !deleteItemsPermanently) {
      setSubmitErr("Choose another shelf for your items, or delete items permanently.");
      return;
    }
    if (hasItems && moveToId.trim() && deleteItemsPermanently) {
      setSubmitErr("Choose only one: move items or delete them permanently.");
      return;
    }
    setBusy(true);
    try {
      const out = await deleteCollection(coll.id, {
        ...(moveToId.trim() ? { move_items_to: moveToId.trim() } : {}),
        ...(deleteItemsPermanently ? { delete_items: true } : {}),
      });
      if (out.ok) {
        onOpenChange(false);
        onDeleted();
        return;
      }
      if ("conflict" in out) {
        setSubmitErr("Could not delete: the shelf still has items. Try again.");
        setConflict(out.conflict);
        return;
      }
      setSubmitErr(out.message);
    } finally {
      setBusy(false);
    }
  }

  const hasItems = collection.item_count > 0 && !probeSaysEmpty;
  const submitDisabled = busy || (hasItems && !deleteItemsPermanently && !moveToId.trim());

  return (
    <KuratorModal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!busy}
      showHeader={false}
      labelledBy="delete-collection-title"
      panelClassName="max-w-md"
    >
            <h2 id="delete-collection-title" className="kurator-panel-title text-kurator-fg">
              Delete Collection
            </h2>
            <p className="mt-2 text-sm text-kurator-muted">
              <span className="font-medium text-kurator-fg">“{collection.name}”</span>
              {hasItems
                ? ` has ${collection.item_count} ${collection.item_count === 1 ? "item" : "items"}.`
                : " has no items."}
            </p>

            {hasItems && busy && !conflict && !loadErr && (
              <p className="mt-4 text-sm text-kurator-muted">Checking your other shelves…</p>
            )}

            {loadErr && (
              <p className="mt-4 text-sm text-amber-200/90" role="alert">
                {loadErr}
              </p>
            )}

            {hasItems && conflict && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-kurator-fg">
                  Move everything to another shelf you own, or delete all items on this shelf permanently. Deleting the
                  collection without moving removes the shelf only when it is empty or when you confirm item deletion.
                </p>
                {conflict.eligible_move_targets.length > 0 ? (
                  <label className="block text-sm">
                    <span className="text-kurator-muted">Move items to</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                      value={moveToId}
                      onChange={(e) => {
                        setMoveToId(e.target.value);
                        setDeleteItemsPermanently(false);
                      }}
                      disabled={busy}
                    >
                      <option value="">Select a collection…</option>
                      {conflict.eligible_move_targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({targetSubtitle(t.category)})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm text-kurator-muted">
                    No other shelf can hold every item type on this one. Move or remove items manually, or delete all
                    items below.
                  </p>
                )}
                <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-muted">
                  <input
                    type="checkbox"
                    className="mt-1 rounded-sm border-kurator-border"
                    checked={deleteItemsPermanently}
                    onChange={(e) => {
                      setDeleteItemsPermanently(e.target.checked);
                      if (e.target.checked) setMoveToId("");
                    }}
                    disabled={busy}
                  />
                  <span>
                    Delete all {collection.item_count} {collection.item_count === 1 ? "item" : "items"} permanently
                    (cannot be undone)
                  </span>
                </label>
              </div>
            )}

            {!hasItems && (
              <p className="mt-4 text-sm text-kurator-muted">This shelf will be removed. You can create a new one anytime.</p>
            )}

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
                {busy ? "Working…" : "Delete Collection"}
              </button>
            </div>
    </KuratorModal>
  );
}
