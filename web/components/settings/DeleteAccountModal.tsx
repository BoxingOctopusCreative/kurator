"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deactivateAccount,
  exportAllOwnedShelvesCsv,
  fetchAccountDeletionContext,
  type SharedShelfForDeletion,
  type ShelfOwnershipTransfer,
} from "@/lib/accountDeletion";
import { KuratorModal } from "@/components/KuratorModal";
import { logout } from "@/lib/auth";

type Props = {
  open: boolean;
  userId: number;
  onOpenChange: (open: boolean) => void;
  onDeactivated: () => void;
};

export function DeleteAccountModal({ open, userId, onOpenChange, onDeactivated }: Props) {
  const [sharedShelves, setSharedShelves] = useState<SharedShelfForDeletion[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const shelves = await fetchAccountDeletionContext();
      setSharedShelves(shelves);
      const initial: Record<string, string> = {};
      for (const sh of shelves) {
        initial[`${sh.kind}:${sh.id}`] = "";
      }
      setTransfers(initial);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load account details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setConfirmText("");
    setExportMsg(null);
    setSubmitErr(null);
    void load();
  }, [open, load]);

  async function onExport() {
    setExportBusy(true);
    setExportMsg(null);
    try {
      const { files, errors } = await exportAllOwnedShelvesCsv(userId);
      if (files === 0 && errors.length === 0) {
        setExportMsg("No shelves to export.");
      } else if (errors.length === 0) {
        setExportMsg(`Downloaded ${files} CSV file${files === 1 ? "" : "s"}.`);
      } else {
        setExportMsg(
          `Downloaded ${files} file${files === 1 ? "" : "s"}. Some exports failed: ${errors.slice(0, 3).join("; ")}`,
        );
      }
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportBusy(false);
    }
  }

  async function onConfirmDelete() {
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setSubmitErr('Type DELETE in the confirmation box to continue.');
      return;
    }
    setSubmitErr(null);
    setBusy(true);
    try {
      const payload: ShelfOwnershipTransfer[] = [];
      for (const sh of sharedShelves) {
        const key = `${sh.kind}:${sh.id}`;
        const raw = transfers[key]?.trim();
        if (!raw) continue;
        const newOwnerId = Number.parseInt(raw, 10);
        if (!Number.isFinite(newOwnerId) || newOwnerId < 1) {
          setSubmitErr(`Choose a valid new owner for “${sh.name}”.`);
          return;
        }
        payload.push({ kind: sh.kind, shelf_id: sh.id, new_owner_id: newOwnerId });
      }
      await deactivateAccount(payload);
      await logout();
      onOpenChange(false);
      onDeactivated();
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Could not delete account.");
    } finally {
      setBusy(false);
    }
  }

  const shelfKindLabel = (kind: string) => {
    if (kind === "collection") return "Collection";
    if (kind === "wishlist") return "Wishlist";
    if (kind === "list") return "List";
    return kind;
  };

  return (
    <KuratorModal
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!busy}
      overlayClassName="bg-black/50"
      showHeader={false}
      labelledBy="delete-account-title"
      panelClassName="border-red-500/40"
    >
        <h2 id="delete-account-title" className="text-lg font-semibold text-red-400">
          Delete your account
        </h2>
        <p className="mt-2 text-sm text-kurator-muted">
          Your account will be <span className="font-medium text-kurator-fg">deactivated immediately</span> and
          hidden from everyone on Kurator. You will be signed out. After{" "}
          <span className="font-medium text-kurator-fg">30 days</span>, your account and any remaining content you
          own will be permanently deleted unless you reactivate using the link we email you.
        </p>

        <div className="mt-4 rounded-lg border border-kurator-border bg-kurator-bg/60 p-3">
          <p className="text-sm font-medium text-kurator-fg">Export your shelves (optional)</p>
          <p className="mt-1 text-xs text-kurator-muted">
            Download CSV files for your collections, lists, and wishlists before you go.
          </p>
          <button
            type="button"
            disabled={exportBusy || busy}
            onClick={() => void onExport()}
            className="mt-2 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-sm text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
          >
            {exportBusy ? "Exporting…" : "Export shelves to CSV"}
          </button>
          {exportMsg ? <p className="mt-2 text-xs text-kurator-muted">{exportMsg}</p> : null}
        </div>

        {loading ? <p className="mt-4 text-sm text-kurator-muted">Loading shared shelves…</p> : null}
        {loadErr ? (
          <p className="mt-4 text-sm text-amber-200/90" role="alert">
            {loadErr}
          </p>
        ) : null}

        {sharedShelves.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-kurator-fg">Transfer shared shelf ownership (optional)</p>
            <p className="text-xs text-kurator-muted">
              For each shared shelf you own, assign a new owner from current collaborators, or leave blank to
              let remaining members take over (solo) or vote (multiple members).
            </p>
            {sharedShelves.map((sh) => {
              const key = `${sh.kind}:${sh.id}`;
              return (
                <label key={key} className="block text-sm">
                  <span className="text-kurator-muted">
                    {shelfKindLabel(sh.kind)}: <span className="text-kurator-fg">{sh.name}</span>
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                    value={transfers[key] ?? ""}
                    onChange={(e) => setTransfers((prev) => ({ ...prev, [key]: e.target.value }))}
                    disabled={busy}
                  >
                    <option value="">Let collaborators decide later</option>
                    {sh.members.map((m) => (
                      <option key={m.user_id} value={String(m.user_id)}>
                        {m.display_name || m.username} (@{m.username})
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        ) : null}

        <label className="mt-5 block text-sm">
          <span className="text-kurator-muted">
            Type <span className="font-mono font-medium text-kurator-fg">DELETE</span> to confirm
          </span>
          <input
            type="text"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={busy}
          />
        </label>

        {submitErr ? (
          <p className="mt-3 text-sm text-amber-200/90" role="alert">
            {submitErr}
          </p>
        ) : null}

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
            disabled={busy || confirmText.trim().toUpperCase() !== "DELETE"}
            onClick={() => void onConfirmDelete()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? "Deleting account…" : "Delete my account"}
          </button>
        </div>
    </KuratorModal>
  );
}