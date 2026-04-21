"use client";

import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** `aria-labelledby` / `id` on the dialog title (must be unique per page). */
  titleId?: string;
  children: ReactNode;
};

export function WishlistSettingsModal({
  open,
  onOpenChange,
  title = "Wishlist settings",
  titleId = "wishlist-settings-dialog-title",
  children,
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
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-kurator-border bg-kurator-surface p-5 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-kurator-fg">
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
        {children}
      </div>
    </div>
  );
}
