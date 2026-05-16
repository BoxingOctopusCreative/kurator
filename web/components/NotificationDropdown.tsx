"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  approveShelfAccessRequest,
  dismissShelfAccessRequest,
  fetchNotificationUnreadCount,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  publicLegalNameLine,
  type NotificationFeedItem,
} from "@/lib/api";
import {
  acceptShelfOwnershipTakeover,
  voteShelfOwnershipElection,
} from "@/lib/accountDeletion";

/** One poll + visibility/focus refresh for all instances (mobile + desktop each mount this component). */
let sharedUnreadCached = 0;
const sharedUnreadListeners = new Set<(n: number) => void>();
let unreadPollRefCount = 0;
let unreadPollTimer: ReturnType<typeof setInterval> | null = null;
let lastThrottledUnreadFetch = 0;
let unreadVisibilityHandler: (() => void) | null = null;

function setSharedUnread(n: number) {
  const v = Math.max(0, Math.trunc(Number(n)));
  if (!Number.isFinite(v)) return;
  sharedUnreadCached = v;
  for (const l of sharedUnreadListeners) l(v);
}

function refreshSharedUnreadFromApi(): Promise<void> {
  return fetchNotificationUnreadCount()
    .then((n) => setSharedUnread(n))
    .catch(() => {});
}

function throttledRefreshSharedUnread(minGapMs: number) {
  const now = Date.now();
  if (now - lastThrottledUnreadFetch < minGapMs) return;
  lastThrottledUnreadFetch = now;
  void refreshSharedUnreadFromApi();
}

function startSharedUnreadPolling() {
  if (unreadPollTimer != null) return;
  unreadPollTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    void refreshSharedUnreadFromApi();
  }, 45_000);

  unreadVisibilityHandler = () => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    throttledRefreshSharedUnread(2000);
  };
  document.addEventListener("visibilitychange", unreadVisibilityHandler);
  window.addEventListener("focus", unreadVisibilityHandler);
  void refreshSharedUnreadFromApi();
}

function stopSharedUnreadPolling() {
  if (unreadPollTimer != null) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
  if (unreadVisibilityHandler != null) {
    document.removeEventListener("visibilitychange", unreadVisibilityHandler);
    window.removeEventListener("focus", unreadVisibilityHandler);
    unreadVisibilityHandler = null;
  }
}

function subscribeSharedUnread(listener: (n: number) => void): () => void {
  sharedUnreadListeners.add(listener);
  listener(sharedUnreadCached);
  unreadPollRefCount += 1;
  if (unreadPollRefCount === 1) {
    startSharedUnreadPolling();
  }
  return () => {
    sharedUnreadListeners.delete(listener);
    unreadPollRefCount -= 1;
    if (unreadPollRefCount <= 0) {
      unreadPollRefCount = 0;
      stopSharedUnreadPolling();
    }
  };
}

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

type SuccessionCandidate = {
  user_id: number;
  username: string;
  display_name: string;
};

function payloadCandidates(p: Record<string, unknown>): SuccessionCandidate[] {
  const raw = p.candidates;
  if (!Array.isArray(raw)) return [];
  const out: SuccessionCandidate[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const userId = payloadNum(o, "user_id");
    if (userId == null || userId < 1) continue;
    out.push({
      user_id: userId,
      username: payloadStr(o, "username"),
      display_name: payloadStr(o, "display_name"),
    });
  }
  return out;
}

function shelfHrefFromPayload(p: Record<string, unknown>): string | null {
  const kind = payloadStr(p, "shelf_kind");
  const id = payloadStr(p, "shelf_id");
  if (!id) return null;
  switch (kind) {
    case "collection":
      return `/collections/${id}`;
    case "list":
      return `/lists/${id}`;
    case "wishlist":
      return `/wishlists/${id}`;
    default:
      return null;
  }
}

function payloadNum(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
      if (!id) return null;
      return `/lists/${id}`;
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
    case "new_follower": {
      const u = n.actor.username?.trim();
      return u ? `/people/${encodeURIComponent(u)}` : null;
    }
    case "shelf_access_request":
      return null;
    case "shelf_ownership_takeover":
    case "shelf_ownership_election":
      return shelfHrefFromPayload(p);
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
    case "new_follower":
      return `${who} started following you.`;
    case "shelf_access_request": {
      const flow = payloadStr(p, "flow");
      const shelf = payloadStr(p, "shelf_name");
      const label = shelf ? `“${shelf}”` : "a shelf";
      if (flow === "invite") {
        return `${who} invited you to collaborate on ${label}.`;
      }
      return `${who} asked to join ${label}.`;
    }
    case "shelf_ownership_takeover": {
      const shelf = payloadStr(p, "shelf_name");
      const label = shelf ? `“${shelf}”` : "a shared shelf";
      return `The owner deleted their account. You can take over ${label}.`;
    }
    case "shelf_ownership_election": {
      const shelf = payloadStr(p, "shelf_name");
      const label = shelf ? `“${shelf}”` : "a shared shelf";
      return `The owner deleted their account. Collaborators must agree on a new owner for ${label}.`;
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

type ShelfOwnershipSuccessionRowProps = {
  n: NotificationFeedItem;
  inner: ReactNode;
  href: string | null;
  onPick: (n: NotificationFeedItem) => void | Promise<void>;
  onAccept: (notificationId: number, successionId: number) => void | Promise<void>;
  onVote: (
    notificationId: number,
    successionId: number,
    candidateId: number,
  ) => void | Promise<void>;
};

function ShelfOwnershipSuccessionRow({
  n,
  inner,
  href,
  onPick,
  onAccept,
  onVote,
}: ShelfOwnershipSuccessionRowProps) {
  const successionId = payloadNum(n.payload, "succession_id");
  const [candidateId, setCandidateId] = useState("");
  const candidates = payloadCandidates(n.payload);

  const actions =
    successionId == null ? null : n.kind === "shelf_ownership_takeover" ? (
      <button
        type="button"
        className="rounded-lg bg-kurator-accent px-2.5 py-1 text-xs font-medium text-kurator-onAccent hover:opacity-90"
        onClick={() => void onAccept(n.id, successionId)}
      >
        Take over ownership
      </button>
    ) : (
      <>
        <select
          className="min-w-0 flex-1 rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1 text-xs text-kurator-fg"
          value={candidateId}
          onChange={(e) => setCandidateId(e.target.value)}
        >
          <option value="">Vote for owner…</option>
          {candidates.map((c) => (
            <option key={c.user_id} value={String(c.user_id)}>
              {c.display_name || c.username} (@{c.username})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!candidateId}
          className="rounded-lg bg-kurator-accent px-2.5 py-1 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          onClick={() => void onVote(n.id, successionId, Number.parseInt(candidateId, 10))}
        >
          Submit vote
        </button>
      </>
    );

  const body = (
    <>
      {inner}
      {actions ? <div className="mt-2 flex flex-wrap items-center gap-2 pl-10">{actions}</div> : null}
    </>
  );

  return (
    <li>
      <div className="px-3 py-2.5" role="group" aria-label="Shelf ownership succession">
        {href ? (
          <Link
            href={href}
            role="menuitem"
            className="block transition-colors hover:bg-kurator-border/20"
            onClick={() => void onPick(n)}
          >
            {body}
          </Link>
        ) : (
          <button
            type="button"
            role="menuitem"
            className="w-full text-left"
            onClick={() => void onPick(n)}
          >
            {body}
          </button>
        )}
      </div>
    </li>
  );
}

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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    setErr(null);
    try {
      const data = await fetchNotifications({ limit: 25 });
      setItems(data.notifications);
      setSharedUnread(data.unread_count);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load notifications.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    return subscribeSharedUnread(setUnread);
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
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void load({ silent: true });
    }, 30_000);
    return () => clearInterval(id);
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
        setSharedUnread(Math.max(0, sharedUnreadCached - 1));
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
      setSharedUnread(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not mark all read.");
    }
  }

  async function onShelfApprove(notificationId: number, requestId: number) {
    setErr(null);
    try {
      await approveShelfAccessRequest(requestId);
      if (items.find((x) => x.id === notificationId && !x.read)) {
        await markNotificationRead(notificationId);
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not approve request.");
    }
  }

  async function onShelfDismiss(notificationId: number, requestId: number) {
    setErr(null);
    try {
      await dismissShelfAccessRequest(requestId);
      if (items.find((x) => x.id === notificationId && !x.read)) {
        await markNotificationRead(notificationId);
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not dismiss request.");
    }
  }

  async function onSuccessionAccept(notificationId: number, successionId: number) {
    setErr(null);
    try {
      await acceptShelfOwnershipTakeover(successionId);
      if (items.find((x) => x.id === notificationId && !x.read)) {
        await markNotificationRead(notificationId);
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not take over ownership.");
    }
  }

  async function onSuccessionVote(
    notificationId: number,
    successionId: number,
    candidateId: number,
  ) {
    setErr(null);
    try {
      await voteShelfOwnershipElection(successionId, candidateId);
      if (items.find((x) => x.id === notificationId && !x.read)) {
        await markNotificationRead(notificationId);
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit vote.");
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
              No activity yet. When someone follows you or people you follow add shelves or rate
              items you can see, it shows up here.
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

                if (n.kind === "shelf_access_request") {
                  const reqId = payloadNum(n.payload, "request_id");
                  return (
                    <li key={n.id}>
                      <div className="px-3 py-2.5" role="group" aria-label="Shelf sharing request">
                        {inner}
                        {reqId != null ? (
                          <div className="mt-2 flex flex-wrap gap-2 pl-10">
                            <button
                              type="button"
                              className="rounded-lg bg-kurator-accent px-2.5 py-1 text-xs font-medium text-kurator-onAccent hover:opacity-90"
                              onClick={() => void onShelfApprove(n.id, reqId)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-kurator-border px-2.5 py-1 text-xs text-kurator-muted hover:bg-kurator-border/30"
                              onClick={() => void onShelfDismiss(n.id, reqId)}
                            >
                              Ignore
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                }

                if (
                  n.kind === "shelf_ownership_takeover" ||
                  n.kind === "shelf_ownership_election"
                ) {
                  return (
                    <ShelfOwnershipSuccessionRow
                      key={n.id}
                      n={n}
                      inner={inner}
                      href={href}
                      onPick={onPick}
                      onAccept={onSuccessionAccept}
                      onVote={onSuccessionVote}
                    />
                  );
                }

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
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onMenuOpen();
        }}
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
