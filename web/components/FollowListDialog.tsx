"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchUserFollowers,
  fetchUserFollowing,
  type PublicUser,
  type UserListResponse,
} from "@/lib/api";
import { KuratorModal } from "@/components/KuratorModal";
import { safeImageSrcUrl } from "@/lib/safeUrl";

type Variant = "followers" | "following";

type Props = {
  variant: Variant | null;
  userRef: string;
  profileDisplayName?: string | null;
  onOpenChange: (open: boolean) => void;
};

async function fetchPage(ref: string, variant: Variant, page: number): Promise<UserListResponse> {
  if (variant === "followers") {
    return fetchUserFollowers(ref, { page, limit: 24 });
  }
  return fetchUserFollowing(ref, { page, limit: 24 });
}

function UserRow({ u }: { u: PublicUser }) {
  const href = `/people/${encodeURIComponent(u.username)}`;
  const label = u.display_name?.trim() || u.username;
  const avatarSrc = safeImageSrcUrl(u.avatar_url ?? undefined);

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-kurator-border hover:bg-kurator-bg/80"
      >
        <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- CDN profile URL
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-medium uppercase text-kurator-muted">
              {(label.slice(0, 1) || "?").toUpperCase()}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-kurator-fg">{label}</span>
          <span className="block truncate text-xs text-kurator-muted">@{u.username}</span>
        </span>
      </Link>
    </li>
  );
}

export function FollowListDialog({
  variant,
  userRef,
  profileDisplayName,
  onOpenChange,
}: Props) {
  const open = variant != null;
  const title =
    variant === "followers"
      ? "Followers"
      : variant === "following"
        ? "Following"
        : "People";

  const [items, setItems] = useState<PublicUser[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || variant == null) {
      setItems([]);
      setPage(1);
      setTotal(null);
      setErr(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    let cancelled = false;
    setItems([]);
    setPage(1);
    setTotal(null);
    setErr(null);
    setLoading(true);
    void fetchPage(userRef, variant, 1)
      .then((r) => {
        if (!cancelled) {
          setItems(r.items);
          setTotal(r.total);
          setPage(1);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Could not load this list.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, variant, userRef]);

  async function loadMore() {
    if (variant == null || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    setErr(null);
    try {
      const r = await fetchPage(userRef, variant, nextPage);
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const extra = r.items.filter((it) => !seen.has(it.id));
        return [...prev, ...extra];
      });
      setTotal(r.total);
      setPage(nextPage);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  const subtitle = profileDisplayName?.trim() || userRef;
  const canLoadMore = total != null && items.length < total;

  return (
    <KuratorModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
      dismissible={!loading}
      showHeader={false}
      labelledBy="follow-list-title"
      panelClassName="relative max-h-[min(560px,calc(100vh-4rem))] max-w-md overflow-hidden p-0"
    >
          <div className="border-b border-kurator-border px-5 py-4">
          <h2 id="follow-list-title" className="kurator-panel-title text-kurator-fg">
            {title}
          </h2>
          <p className="mt-1 text-sm text-kurator-muted">{subtitle}</p>
        </div>

        <div className="max-h-[440px] overflow-y-auto px-3 py-2">
          {loading && (
            <p className="px-2 py-6 text-center text-sm text-kurator-muted">Loading…</p>
          )}
          {err && !loading && (
            <p className="px-2 py-4 text-center text-sm text-amber-200/90" role="alert">
              {err}
            </p>
          )}
          {!loading && !err && items.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-kurator-muted">No accounts to show.</p>
          )}
          {!loading && items.length > 0 && (
            <ul className="space-y-0.5">{items.map((u) => <UserRow key={u.id} u={u} />)}</ul>
          )}
          {!loading && canLoadMore && (
            <div className="sticky bottom-0 border-t border-kurator-border bg-kurator-surface/95 px-2 py-3 backdrop-blur-sm">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="w-full rounded-lg border border-kurator-border py-2 text-sm text-kurator-fg hover:bg-kurator-border/30 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-kurator-border px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="w-full rounded-lg border border-kurator-border bg-kurator-bg px-4 py-2 text-sm text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
          >
            Close
          </button>
        </div>
    </KuratorModal>
  );
}
