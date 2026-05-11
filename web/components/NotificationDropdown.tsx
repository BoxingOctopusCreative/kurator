"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  publicLegalNameLine,
  type NotificationFeedItem,
} from "@/lib/api";

function actorLabel(actor: NotificationFeedItem["actor"]): string {
  const legal = publicLegalNameLine(actor);
  if (legal) return legal;
  if (actor.display_name?.trim()) return actor.display_name.trim();
  return `@${actor.username}`;
}

function payloadStr(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  return typeof v === "string" ? v : "";
}

function notificationHref(n: NotificationFeedItem): string | null {
  const p = n.payload;
  switch (n.kind) {
    case "collection_created": {
      const id = payloadStr(p, "collection_id");
      return id ? `/collections/${id}` : null;
    }
    case "list_created": {
      const id = payloadStr(p, "list_id");
      return id ? `/lists/${id}` : null;
    }
    case "wishlist_created": {
      const id = payloadStr(p, "wishlist_id");
      return id ? `/wishlists/${id}` : null;
    }
    case "item_added":
    case "item_rated": {
      const id = payloadStr(p, "item_id");
      return id ? `/items/${id}` : null;
    }
    default:
      return null;
  }
}

function notificationSummary(n: NotificationFeedItem): string {
  const who = actorLabel(n.actor);
  const p = n.payload;
  const name = payloadStr(p, "name");
  const itemTitle = payloadStr(p, "item_title");
  const coll = payloadStr(p, "collection_name");
  switch (n.kind) {
    case "collection_created":
      return `${who} created a collection${name ? ` “${name}”` : ""}.`;
    case "list_created":
      return `${who} created a list${name ? ` “${name}”` : ""}.`;
    case "wishlist_created":
      return `${who} created a wishlist${name ? ` “${name}”` : ""}.`;
    case "item_added": {
      const r = p.rating;
      const stars = typeof r === "number" ? r : null;
      const tail =
        stars != null && stars >= 1 && stars <= 5
          ? ` (${stars}★) on “${coll || "a collection"}”.`
          : ` on “${coll || "a collection"}”.`;
      return `${who} added “${itemTitle || "an item"}”${tail}`;
    }
    case "item_rated": {
      const stars = typeof p.stars === "number" ? p.stars : null;
      return `${who} rated “${itemTitle || "an item"}”${stars != null ? ` ${stars}★` : ""}${
        coll ? ` on “${coll}”.` : "."
      }`;
    }
    default:
      return `${who} did something in Kurator.`;
  }
}

type NotificationDropdownProps = {
  /** Increment to force-close the panel (e.g. account menu opened). */
  closeSignal: number;
  /** Called when this panel opens so a sibling menu can close. */
  onMenuOpen: () => void;
};

const PANEL_MAX_WIDTH_REM = 22;
const PANEL_MAX_HEIGHT_REM = 20;
const EDGE_PAD_PX = 12;
const GAP_BELOW_TRIGGER_PX = 8;

type PanelPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function measurePanelPlacement(buttonEl: HTMLElement): PanelPlacement {
  const r = buttonEl.getBoundingClientRect();
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  /** Prefer visual viewport on mobile (URL bar, pinch-zoom). */
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  const originX = vv?.offsetLeft ?? 0;

  const usableW = Math.max(0, vw - 2 * EDGE_PAD_PX);
  const width = Math.max(1, Math.min(PANEL_MAX_WIDTH_REM * 16, usableW));

  const rightAlign = r.right;
  let left = rightAlign - width;
  const minX = originX + EDGE_PAD_PX;
  const maxX = originX + vw - width - EDGE_PAD_PX;
  left = Math.max(minX, Math.min(left, maxX));

  const top = r.bottom + GAP_BELOW_TRIGGER_PX;
  const maxBody = PANEL_MAX_HEIGHT_REM * 16;
  const maxHeight = Math.max(
    140,
    Math.min(maxBody, Math.max(0, vh - top - EDGE_PAD_PX)),
  );

  return { top, left, width, maxHeight };
}

export function NotificationDropdown({ closeSignal, onMenuOpen }: NotificationDropdownProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchNotifications({ limit: 25 });
      setItems(data.notifications);
      setUnread(data.unread_count);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications({ limit: 1 })
      .then((d) => setUnread(d.unread_count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [closeSignal]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      const t = ev.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const updatePlacement = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    setPlacement(measurePanelPlacement(btn));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updatePlacement);
    vv?.addEventListener("scroll", updatePlacement);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      vv?.removeEventListener("resize", updatePlacement);
      vv?.removeEventListener("scroll", updatePlacement);
    };
  }, [open, updatePlacement]);

  async function onPick(n: NotificationFeedItem) {
    if (!n.read) {
      try {
        await markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
        );
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        /* still navigate */
      }
    }
    setOpen(false);
  }

  async function onMarkAll() {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not mark all read.");
    }
  }

  const panel =
    open && placement ? (
      <div
        ref={panelRef}
        className="fixed z-[200] flex flex-col overflow-hidden rounded-xl border border-kurator-border bg-kurator-surface py-2 shadow-dropdown"
        style={{
          top: placement.top,
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
        }}
        role="menu"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-kurator-border px-3 pb-2">
          <span className="text-sm font-semibold text-kurator-fg">Activity</span>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void onMarkAll()}
              className="text-xs text-kurator-accent hover:underline"
            >
              Mark All Read
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-4 text-center text-xs text-kurator-muted">Loading…</p>
          ) : err ? (
            <p className="px-3 py-3 text-center text-xs text-red-400">{err}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-kurator-muted">
              No activity yet. When people you follow add shelves or rate items you can see, it
              shows up here.
            </p>
          ) : (
            <ul className="divide-y divide-kurator-border/60">
              {items.map((n) => {
                const href = notificationHref(n);
                const summary = notificationSummary(n);
                const inner = (
                  <span className="flex gap-2 text-left">
                    {n.actor.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={n.actor.avatar_url}
                        alt=""
                        className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kurator-border text-[10px] font-medium text-kurator-muted">
                        {(actorLabel(n.actor).slice(0, 1) || "?").toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`text-xs leading-snug ${n.read ? "text-kurator-muted" : "text-kurator-fg"}`}
                      >
                        {summary}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-kurator-muted">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </span>
                  </span>
                );
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link
                        href={href}
                        role="menuitem"
                        className="block px-3 py-2.5 transition-colors hover:bg-kurator-border/30"
                        onClick={() => void onPick(n)}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-3 py-2.5 text-left transition-colors hover:bg-kurator-border/30"
                        onClick={() => void onPick(n)}
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() =>
          setOpen((v) => {
            const next = !v;
            if (next) onMenuOpen();
            return next;
          })
        }
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-kurator-surface/95 text-kurator-muted shadow-md backdrop-blur-md transition-colors hover:bg-kurator-border/50 hover:text-kurator-fg"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-kurator-accent px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
