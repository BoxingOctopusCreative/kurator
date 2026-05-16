"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { KURATOR_DISCORD_INVITE_URL } from "@/lib/kuratorDiscordInvite";

/**
 * Logged-out menu for the public black logo strip: same dropdown pattern as {@link AccountMenu},
 * with a hamburger trigger and auth / Discord links.
 */
export function PublicBrandMenu() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const nextParam =
    pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (user) {
    return null;
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-md backdrop-blur-sm transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-[min(16rem,calc(100vw-2rem))] rounded-xl border border-kurator-border bg-kurator-surface py-2 shadow-dropdown"
          role="menu"
        >
          <Link
            href={`/login${nextParam}`}
            role="menuitem"
            className="block px-3 py-2 text-sm text-kurator-fg transition-colors hover:bg-kurator-border/40"
            onClick={() => setOpen(false)}
          >
            Log In
          </Link>
          <Link
            href={`/register${nextParam}`}
            role="menuitem"
            className="block px-3 py-2 text-sm text-kurator-fg transition-colors hover:bg-kurator-border/40"
            onClick={() => setOpen(false)}
          >
            Register
          </Link>
          <a
            href={KURATOR_DISCORD_INVITE_URL}
            role="menuitem"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-sm text-kurator-fg transition-colors hover:bg-kurator-border/40"
            onClick={() => setOpen(false)}
          >
            Join the Discord
          </a>
        </div>
      ) : null}
    </div>
  );
}
