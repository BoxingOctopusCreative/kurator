"use client";

import { useEffect } from "react";
import { CoverArtField } from "@/components/CoverArtField";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
};

export function CoverArtEditModal({
  open,
  onOpenChange,
  title = "Cover Art",
  value,
  onChange,
  disabled = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-art-dialog-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-kurator-border bg-kurator-surface p-5 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="cover-art-dialog-title" className="text-lg font-semibold text-kurator-fg">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-kurator-border px-3 py-1.5 text-sm text-kurator-muted hover:bg-kurator-border/40 hover:text-kurator-fg"
          >
            Close
          </button>
        </div>
        <CoverArtField value={value} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}
