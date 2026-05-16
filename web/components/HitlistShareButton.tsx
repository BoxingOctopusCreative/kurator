"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { shareOrCopyUrl } from "@/lib/shareOrCopyUrl";

type Props = {
  /** Path only, e.g. `/hitlists/my-list` — full URL is built with `window.location.origin`. */
  permalinkPath: string;
  /** List title for the system share sheet. */
  listName: string;
  className?: string;
};

export function HitlistShareButton({
  permalinkPath,
  listName,
  className = "inline-flex items-center gap-0.5 rounded-md border border-kurator-border px-1.5 py-0.5 text-[10px] font-medium text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"copied" | "error" | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlashLater = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const onShare = useCallback(async () => {
    if (busy || typeof window === "undefined") return;
    const path = permalinkPath.trim();
    if (!path.startsWith("/")) return;
    setBusy(true);
    setFlash(null);
    const url = `${window.location.origin}${path}`;
    try {
      const r = await shareOrCopyUrl(url, {
        title: listName.trim() || "Hitlist",
        text: listName.trim() ? `${listName.trim()} on Kurator` : "Hitlist on Kurator",
      });
      if (r === "copied") {
        setFlash("copied");
        clearFlashLater();
      } else if (r === "failed") {
        setFlash("error");
        clearFlashLater();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, permalinkPath, listName, clearFlashLater]);

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        className={className}
        aria-label="Share hitlist link"
        onClick={() => void onShare()}
      >
        <Share2 className="h-3 w-3" aria-hidden />
        Share
      </button>
      {flash === "copied" ? (
        <span className="text-[10px] text-kurator-muted" role="status">
          Link copied
        </span>
      ) : null}
      {flash === "error" ? (
        <span className="text-[10px] text-amber-200/90" role="alert">
          Could not share
        </span>
      ) : null}
    </span>
  );
}
