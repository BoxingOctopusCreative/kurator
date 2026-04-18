"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LandingPage } from "@/components/LandingPage";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { fetchItems, type Item } from "@/lib/api";
import { categoryLabel } from "@/lib/categoryLabels";
import { getCoverArtUrl } from "@/lib/itemDisplay";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";

type Props = {
  initialBackground?: UnsplashBackgroundPayload | null;
};

const DASHBOARD_ROW_LIMIT = 24;

function ItemCard({ item }: { item: Item }) {
  const cover = getCoverArtUrl(item.metadata);
  return (
    <li className="w-[min(260px,85vw)] shrink-0 snap-start">
      <Link
        href={`/collections/${item.collection_id}`}
        className="flex h-full min-h-[260px] flex-col rounded-xl border border-kurator-border bg-kurator-surface shadow-sm transition-colors hover:border-kurator-accent/50"
      >
        <div className="shrink-0 space-y-2 p-3 pb-2">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-kurator-fg">{item.title}</h3>
          <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
            {categoryLabel(item.category)}
          </span>
        </div>
        <div className="mt-auto flex flex-1 flex-col justify-end p-3 pt-2">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg">
            <ItemCoverImage
              url={cover}
              alt={`Cover for ${item.title}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </div>
      </Link>
    </li>
  );
}

function ItemRow({
  title,
  description,
  items,
  loading,
  error,
  emptyHint,
}: {
  title: string;
  description: string;
  items: Item[];
  loading: boolean;
  error: string | null;
  emptyHint: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-kurator-fg">{title}</h2>
        <p className="mt-0.5 text-sm text-kurator-muted">{description}</p>
      </div>
      {loading && <p className="text-sm text-kurator-muted">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="rounded-lg border border-kurator-border bg-kurator-surface/60 px-4 py-6 text-sm text-kurator-muted">{emptyHint}</p>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function HomePageClient({ initialBackground = null }: Props) {
  const { user } = useAuth();
  const [mineItems, setMineItems] = useState<Item[]>([]);
  const [followItems, setFollowItems] = useState<Item[]>([]);
  const [loadMine, setLoadMine] = useState(true);
  const [loadFollow, setLoadFollow] = useState(true);
  const [errMine, setErrMine] = useState<string | null>(null);
  const [errFollow, setErrFollow] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadMine(true);
    setLoadFollow(true);
    setErrMine(null);
    setErrFollow(null);

    void (async () => {
      try {
        const data = await fetchItems({ scope: "mine", limit: DASHBOARD_ROW_LIMIT });
        if (!cancelled) setMineItems(data);
      } catch (e: unknown) {
        if (!cancelled) setErrMine(e instanceof Error ? e.message : "Could not load your items.");
      } finally {
        if (!cancelled) setLoadMine(false);
      }
    })();

    void (async () => {
      try {
        const data = await fetchItems({ scope: "following", limit: DASHBOARD_ROW_LIMIT });
        if (!cancelled) setFollowItems(data);
      } catch (e: unknown) {
        if (!cancelled) setErrFollow(e instanceof Error ? e.message : "Could not load followed shelves.");
      } finally {
        if (!cancelled) setLoadFollow(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return <LandingPage initialBackground={initialBackground} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-kurator-muted">Recent adds on your shelves and from people you follow.</p>
        </div>
        <Link
          href="/items/add"
          className="inline-flex items-center justify-center rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90"
        >
          Add item
        </Link>
      </div>

      <ItemRow
        title="Your collections"
        description="Recently added items across collections you own."
        items={mineItems}
        loading={loadMine}
        error={errMine}
        emptyHint={
          <>
            Nothing here yet.{" "}
            <Link href="/items/add" className="text-kurator-accent hover:underline">
              Add an item
            </Link>{" "}
            or open{" "}
            <Link href="/collections" className="text-kurator-accent hover:underline">
              Collections
            </Link>
            .
          </>
        }
      />

      <ItemRow
        title="People you follow"
        description="Recent public adds from collectors you follow."
        items={followItems}
        loading={loadFollow}
        error={errFollow}
        emptyHint={
          <>
            No recent items from followed accounts, or you are not following anyone yet.{" "}
            <Link href="/people" className="text-kurator-accent hover:underline">
              Find people
            </Link>{" "}
            and follow them to see their public shelves here.
          </>
        }
      />
    </div>
  );
}
