"use client";

import { useState } from "react";
import { KuratorModal } from "@/components/KuratorModal";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
};

export function BoardConfirmDeleteModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleConfirm() {
    setErr(null);
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KuratorModal open={open} onOpenChange={onOpenChange} title={title} panelClassName="max-w-md">
      <p className="text-sm text-kurator-muted">{description}</p>
      {err ? (
        <p className="mt-3 text-sm text-red-500" role="alert">
          {err}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onOpenChange(false)}
          className="rounded-lg border border-kurator-border px-3 py-1.5 text-sm text-kurator-muted hover:bg-kurator-border/30 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleConfirm()}
          className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
        >
          {busy ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </KuratorModal>
  );
}
