"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Heart, Layers, ListOrdered, Lock, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LandingPage } from "@/components/LandingPage";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import {
  fetchRecentShelves,
  visibilityOf,
  type DashboardShelf,
  type ShelfKind,
  type Visibility,
} from "@/lib/api";
import { categoryLabel } from "@/lib/categoryLabels";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";

type Props = {
  initialBackground?: UnsplashBackgroundPayload | null;
};

const DASHBOARD_SHELF_LIMIT = 10;

type KindFilter = "all" | ShelfKind;

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "collection", label: "Collections" },
  { value: "list", label: "Lists" },
  { value: "wishlist", label: "Wishlists" },
];

function shelfHref(shelf: DashboardShelf): string {
  switch (shelf.kind) {
    case "collection":
      return `/collections/${shelf.id}`;
    case "list":
      return `/lists/${shelf.id}`;
    case "wishlist":
      return `/wishlists/${shelf.id}`;
  }
}

function shelfKindLabel(kind: ShelfKind): string {
  switch (kind) {
    case "collection":
      return "Collection";
    case "list":
      return "List";
    case "wishlist":
      return "Wishlist";
  }
}

function ShelfKindIcon({ kind, className }: { kind: ShelfKind; className?: string }) {
  switch (kind) {
    case "collection":
      return <Layers className={className} aria-hidden />;
    case "list":
      return <ListOrdered className={className} aria-hidden />;
    case "wishlist":
      return <Heart className={className} aria-hidden />;
  }
}

function shelfItemCountLabel(shelf: DashboardShelf): string {
  if (shelf.kind === "wishlist") {
    const n = Number(shelf.entry_count ?? 0);
    return `${n} ${n === 1 ? "entry" : "entries"}`;
  }
  const n = Number(shelf.item_count ?? 0);
  return `${n} ${n === 1 ? "item" : "items"}`;
}

function ShelfVisibilityBadge({ visibility }: { visibility: Visibility }) {
  if (visibility === "followers") return null;
  const Icon = visibility === "private" ? Lock : Users;
  const label = visibility === "private" ? "Private" : "Friends";
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

function ShelfCard({ shelf }: { shelf: DashboardShelf }) {
  const visibility = visibilityOf(shelf);
  return (
    <li className="w-[min(280px,85vw)] shrink-0 snap-start">
      <Link
        href={shelfHref(shelf)}
        className="flex h-full min-h-[180px] flex-col rounded-xl border border-kurator-border bg-kurator-surface shadow-surface transition-colors hover:border-kurator-accent/50"
      >
        <div className="flex items-start gap-3 p-3">
          <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
            {shelf.cover_art_url ? (
              <ItemCoverImage
                url={shelf.cover_art_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-kurator-border/60 text-kurator-accent">
                <ShelfKindIcon kind={shelf.kind} className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-kurator-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
              <ShelfKindIcon kind={shelf.kind} className="h-3 w-3" />
              {shelfKindLabel(shelf.kind)}
            </span>
            <h3 className="kurator-shelf-tile-title line-clamp-2 text-sm font-medium leading-snug text-kurator-fg">
              {shelf.name}
            </h3>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-kurator-border/60 px-3 py-2 text-xs text-kurator-muted">
          <span>{shelfItemCountLabel(shelf)}</span>
          {shelf.kind === "collection" && shelf.category ? (
            <span className="rounded-full bg-kurator-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
              {categoryLabel(shelf.category)}
            </span>
          ) : null}
          <ShelfVisibilityBadge visibility={visibility} />
        </div>
      </Link>
    </li>
  );
}

function KindFilterChips({
  value,
  onChange,
  idPrefix,
}: {
  value: KindFilter;
  onChange: (v: KindFilter) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by shelf type">
      {KIND_FILTERS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            id={`${idPrefix}-${opt.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-kurator-accent text-kurator-onAccent"
                : "border border-kurator-border text-kurator-muted hover:bg-kurator-border/40"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ShelfRow({
  title,
  description,
  kindFilter,
  onKindFilterChange,
  filterIdPrefix,
  shelves,
  loading,
  error,
  emptyHint,
}: {
  title: string;
  description: string;
  kindFilter: KindFilter;
  onKindFilterChange: (v: KindFilter) => void;
  filterIdPrefix: string;
  shelves: DashboardShelf[];
  loading: boolean;
  error: string | null;
  emptyHint: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="kurator-panel-title text-kurator-fg">{title}</h2>
          <p className="mt-0.5 text-sm text-kurator-muted">{description}</p>
        </div>
        <KindFilterChips
          value={kindFilter}
          onChange={onKindFilterChange}
          idPrefix={filterIdPrefix}
        />
      </div>
      {loading && <p className="text-sm text-kurator-muted">Loading…</p>}
      {error && (
        <p
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
          role="alert"
        >
          {error}
        </p>
      )}
      {!loading && !error && shelves.length === 0 && (
        <p className="rounded-lg shadow-surface border border-kurator-border bg-kurator-surface/60 px-4 py-6 text-sm text-kurator-muted">
          {emptyHint}
        </p>
      )}
      {!loading && !error && shelves.length > 0 && (
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
          {shelves.map((shelf) => (
            <ShelfCard key={`${shelf.kind}:${shelf.id}`} shelf={shelf} />
          ))}
        </ul>
      )}
    </section>
  );
}

function kindParam(value: KindFilter): ShelfKind | undefined {
  return value === "all" ? undefined : value;
}

export function HomePageClient({ initialBackground = null }: Props) {
  const { user } = useAuth();
  const [mineKind, setMineKind] = useState<KindFilter>("all");
  const [followKind, setFollowKind] = useState<KindFilter>("all");
  const [mineShelves, setMineShelves] = useState<DashboardShelf[]>([]);
  const [followShelves, setFollowShelves] = useState<DashboardShelf[]>([]);
  const [loadMine, setLoadMine] = useState(true);
  const [loadFollow, setLoadFollow] = useState(true);
  const [errMine, setErrMine] = useState<string | null>(null);
  const [errFollow, setErrFollow] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadMine(true);
    setErrMine(null);
    void (async () => {
      try {
        const data = await fetchRecentShelves({
          scope: "mine",
          kind: kindParam(mineKind),
          limit: DASHBOARD_SHELF_LIMIT,
        });
        if (!cancelled) setMineShelves(data);
      } catch (e: unknown) {
        if (!cancelled) {
          setErrMine(e instanceof Error ? e.message : "Could not load your shelves.");
        }
      } finally {
        if (!cancelled) setLoadMine(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, mineKind]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadFollow(true);
    setErrFollow(null);
    void (async () => {
      try {
        const data = await fetchRecentShelves({
          scope: "following",
          kind: kindParam(followKind),
          limit: DASHBOARD_SHELF_LIMIT,
        });
        if (!cancelled) setFollowShelves(data);
      } catch (e: unknown) {
        if (!cancelled) {
          setErrFollow(e instanceof Error ? e.message : "Could not load followed shelves.");
        }
      } finally {
        if (!cancelled) setLoadFollow(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, followKind]);

  const mineDescription = useMemo(() => {
    switch (mineKind) {
      case "collection":
        return "Your most recently updated collections.";
      case "list":
        return "Your most recently updated lists.";
      case "wishlist":
        return "Your most recently updated wishlists.";
      default:
        return "Your most recently updated shelves across collections, lists, and wishlists.";
    }
  }, [mineKind]);

  const followDescription = useMemo(() => {
    switch (followKind) {
      case "collection":
        return "Recently updated collections from people you follow.";
      case "list":
        return "Recently updated lists from people you follow.";
      case "wishlist":
        return "Recently updated wishlists from people you follow.";
      default:
        return "Recently updated shelves from people you follow.";
    }
  }, [followKind]);

  if (!user) {
    return <LandingPage initialBackground={initialBackground} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-kurator-muted">
            A quick look at your shelves and the people you follow.
          </p>
        </div>
      </PageHeroUnsplash>

      <ShelfRow
        title="Your Shelves"
        description={mineDescription}
        kindFilter={mineKind}
        onKindFilterChange={setMineKind}
        filterIdPrefix="your-shelves-filter"
        shelves={mineShelves}
        loading={loadMine}
        error={errMine}
        emptyHint={
          <>
            Nothing here yet.{" "}
            <Link href="/collections" className="text-kurator-accent hover:underline">
              Create a collection
            </Link>
            ,{" "}
            <Link href="/lists" className="text-kurator-accent hover:underline">
              start a list
            </Link>
            , or{" "}
            <Link href="/wishlists" className="text-kurator-accent hover:underline">
              add a wishlist
            </Link>
            .
          </>
        }
      />

      <ShelfRow
        title="From People You Follow"
        description={followDescription}
        kindFilter={followKind}
        onKindFilterChange={setFollowKind}
        filterIdPrefix="follow-shelves-filter"
        shelves={followShelves}
        loading={loadFollow}
        error={errFollow}
        emptyHint={
          <>
            No recent shelves from people you follow, or you are not following anyone yet.{" "}
            <Link href="/people" className="text-kurator-accent hover:underline">
              Find People
            </Link>{" "}
            to see their shelves here.
          </>
        }
      />
    </div>
  );
}
