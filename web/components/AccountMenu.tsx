"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { safeImageSrcUrl } from "@/lib/safeUrl";
import { logout } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { ThemePreferenceSelect } from "@/components/ThemePreferenceSelect";
import { KURATOR_DISCORD_INVITE_URL } from "@/lib/kuratorDiscordInvite";
import { isProPlan } from "@/lib/billing";

type Props = {
  /** Increment to force-close this menu (e.g. sibling notifications opened). */
  closeSignal: number;
  /** Called when this menu opens so the sibling can close. */
  onMenuOpen: () => void;
};

export function AccountMenu({ closeSignal, onMenuOpen }: Props) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const themeFieldId = useId();

  useEffect(() => {
    setOpen(false);
  }, [closeSignal]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function onLogout() {
    setOpen(false);
    await logout();
    await refresh();
    router.push("/");
    router.refresh();
  }

  if (!user) {
    return null;
  }

  const selectClass =
    "w-full max-w-none rounded-md border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2";

  const profileHref =
    user.username?.trim().length > 0
      ? `/people/${encodeURIComponent(user.username.trim())}`
      : "/profile";

  const bannerSrc = safeImageSrcUrl(user.banner_url);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onMenuOpen();
        }}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-kurator-border bg-kurator-surface/95 shadow-md backdrop-blur-md transition-opacity hover:opacity-90"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account Menu"
      >
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- profile URL from S3 or external
          <img
            src={user.avatar_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="h-5 w-5 text-kurator-muted" aria-hidden />
        )}
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-kurator-border bg-kurator-topbar shadow-dropdown"
          role="menu"
        >
          <Link
            href={profileHref}
            role="menuitem"
            className="relative block overflow-hidden border-b border-kurator-border outline-hidden transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kurator-accent"
            onClick={() => setOpen(false)}
          >
            {bannerSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- profile banner from S3 or external */}
                <img
                  src={bannerSrc}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-center brightness-[0.75] contrast-[0.5] saturate-[0.75]"
                  aria-hidden
                />
                <div className="absolute inset-0 bg-kurator-bg/45" aria-hidden />
                <div className="absolute inset-0 bg-black/10" aria-hidden />
              </>
            ) : (
              <div className="absolute inset-0 bg-kurator-border/25" aria-hidden />
            )}
            <div className="relative flex items-end gap-2 px-3 pb-3 pt-12">
              <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-kurator-bg/80 bg-kurator-bg shadow-md ring-1 ring-black/20">
                {user.avatar_url && safeImageSrcUrl(user.avatar_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- profile URL from S3 or external
                  <img
                    src={safeImageSrcUrl(user.avatar_url)!}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-kurator-muted">
                    <User className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 pb-0.5">
                <p className="truncate text-sm font-medium text-kurator-fg drop-shadow-sm">
                  {user.display_name || user.email}
                </p>
                <p className="truncate text-xs text-kurator-muted drop-shadow-sm">
                  {user.username?.trim() ? `@${user.username.trim()}` : "Open profile settings"}
                </p>
              </span>
            </div>
          </Link>
          <div className="border-b border-kurator-border px-3 py-2">
            <label
              htmlFor={themeFieldId}
              className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-kurator-muted"
            >
              Theme
            </label>
            <ThemePreferenceSelect id={themeFieldId} className={selectClass} />
          </div>
          <Link
            href="/settings/billing"
            role="menuitem"
            className="block px-3 py-2 text-sm font-medium text-kurator-accent transition-colors hover:bg-kurator-border/40"
            onClick={() => setOpen(false)}
          >
            {isProPlan(user.plan) ? "Billing" : "Upgrade"}
          </Link>
          <Link
            href="/settings/theme"
            role="menuitem"
            className="block px-3 py-2 text-sm text-kurator-fg transition-colors hover:bg-kurator-border/40"
            onClick={() => setOpen(false)}
          >
            Custom Theme
          </Link>
          <Link
            href="/settings/app"
            role="menuitem"
            className="block px-3 py-2 text-sm text-kurator-fg transition-colors hover:bg-kurator-border/40"
            onClick={() => setOpen(false)}
          >
            App Settings
          </Link>
          <Link
            href="/profile"
            role="menuitem"
            className="block px-3 py-2 text-sm text-kurator-fg transition-colors hover:bg-kurator-border/40"
            onClick={() => setOpen(false)}
          >
            Profile Settings
          </Link>
          <a
            href={KURATOR_DISCORD_INVITE_URL}
            role="menuitem"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-sm text-kurator-fg transition-colors hover:bg-kurator-border/40"
            onClick={() => setOpen(false)}
          >
            Join The Discord
          </a>
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-2 text-left text-sm text-kurator-muted transition-colors hover:bg-kurator-border/40 hover:text-kurator-fg"
            onClick={() => void onLogout()}
          >
            Log Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
