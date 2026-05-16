"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Collection, ConsumptionStatus, Item, ItemEnrichment, ItemListRef } from "@/lib/api";
import {
  collectionMayReceiveItems,
  fetchCollection,
  fetchCollections,
  fetchItem,
  fetchItemEnrichment,
  fetchItemLists,
  updateItem,
  visibilityOf,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
  consumptionDoneLabel,
  consumptionPendingLabel,
  normalizeConsumptionStatus,
} from "@/lib/consumptionLabels";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ItemStarRating } from "@/components/ItemStarRating";
import { categoryLabel } from "@/lib/categoryLabels";
import { isEntityUuid } from "@/lib/entityId";
import { getCoverArtUrl, getItemYear, getTvEditionSummary } from "@/lib/itemDisplay";
import { safeHttpUrl } from "@/lib/safeUrl";
import { hitlistBrowsePath } from "@/lib/hitlistBrowsePath";

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ItemDetailClient() {
  const params = useParams();
  const { user } = useAuth();
  const idRaw = params.id;
  const id = typeof idRaw === "string" && isEntityUuid(idRaw) ? idRaw.trim() : "";

  const [item, setItem] = useState<Item | null>(null);
  const [enrichment, setEnrichment] = useState<ItemEnrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [consumptionBusy, setConsumptionBusy] = useState(false);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState<string | null>(null);
  const [itemLists, setItemLists] = useState<ItemListRef[]>([]);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [collectionMoveBusy, setCollectionMoveBusy] = useState(false);
  const [collectionMoveError, setCollectionMoveError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Invalid item.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEnrichment(null);
    setCollectionName(null);
    setItemLists([]);
    fetchItem(id)
      .then(async (data) => {
        if (cancelled) return;
        setItem(data);
        void fetchItemLists(id)
          .then((lists) => {
            if (!cancelled) setItemLists(lists);
          })
          .catch(() => {
            if (!cancelled) setItemLists([]);
          });
        if (data.collection_id) {
          void fetchCollection(data.collection_id)
            .then((col) => {
              if (!cancelled) setCollectionName(col.name.trim() || null);
            })
            .catch(() => {
              if (!cancelled) setCollectionName(null);
            });
        } else if (!cancelled) {
          setCollectionName(null);
        }
        try {
          const e = await fetchItemEnrichment(id);
          if (!cancelled) setEnrichment(e);
        } catch (e: unknown) {
          if (!cancelled) {
            setEnrichment({
              note: e instanceof Error ? e.message : "Could not load synopsis.",
            });
          }
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load item.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const itemId = item?.id;
    if (!itemId || !user) {
      setAllCollections([]);
      return;
    }
    let cancelled = false;
    fetchCollections({ limit: 100, sort: "name_asc" })
      .then((res) => {
        if (!cancelled) setAllCollections(res.items);
      })
      .catch(() => {
        if (!cancelled) setAllCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.category, user]);

  const moveTargetCollections = useMemo(() => {
    if (!item || !user) return [];
    return allCollections.filter((c) => {
      const categoryOk = !c.category || c.category === item.category;
      if (!categoryOk) return false;
      return collectionMayReceiveItems(c);
    });
  }, [allCollections, item, user]);

  const canEditCollectionLocation = useMemo(() => {
    if (!item || !user) return false;
    if (item.collection_id) {
      return moveTargetCollections.some((c) => c.id === item.collection_id);
    }
    return item.owner_user_id === user.id && moveTargetCollections.length > 0;
  }, [item, user, moveTargetCollections]);

  async function saveRating(next: number | null) {
    if (!item) return;
    setRatingError(null);
    setRatingBusy(true);
    try {
      const meta =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {};
      const updated = await updateItem(item.id, {
        title: item.title,
        category: item.category,
        metadata: meta,
        rating: next,
        consumption_status: normalizeConsumptionStatus(item),
      });
      setItem(updated);
    } catch (e: unknown) {
      setRatingError(e instanceof Error ? e.message : "Could not save rating.");
    } finally {
      setRatingBusy(false);
    }
  }

  async function saveConsumption(next: ConsumptionStatus) {
    if (!item) return;
    setConsumptionError(null);
    setConsumptionBusy(true);
    try {
      const meta =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {};
      const updated = await updateItem(item.id, {
        title: item.title,
        category: item.category,
        metadata: meta,
        consumption_status: next,
      });
      setItem(updated);
    } catch (e: unknown) {
      setConsumptionError(e instanceof Error ? e.message : "Could not save status.");
    } finally {
      setConsumptionBusy(false);
    }
  }

  async function saveCollectionMove(nextCollectionId: string) {
    if (!item || nextCollectionId === (item.collection_id ?? "")) return;
    setCollectionMoveError(null);
    setCollectionMoveBusy(true);
    try {
      const meta =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {};
      const updated = await updateItem(item.id, {
        title: item.title,
        category: item.category,
        metadata: meta,
        consumption_status: normalizeConsumptionStatus(item),
        collection_id: nextCollectionId,
      });
      setItem(updated);
      if (updated.collection_id) {
        void fetchCollection(updated.collection_id)
          .then((col) => setCollectionName(col.name.trim() || null))
          .catch(() => setCollectionName(null));
      } else {
        setCollectionName(null);
      }
    } catch (e: unknown) {
      setCollectionMoveError(e instanceof Error ? e.message : "Could not move item.");
    } finally {
      setCollectionMoveBusy(false);
    }
  }

  if (!id) {
    return (
      <p className="text-sm text-red-400" role="alert">
        Invalid item.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-kurator-muted">Loading…</p>;
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error ?? "Item not found."}
        </p>
        <Link href="/collections" className="text-sm text-kurator-accent hover:underline">
          Browse collections
        </Link>
      </div>
    );
  }

  const rawMeta = item.metadata;
  const metaObj =
    rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)
      ? (rawMeta as Record<string, unknown>)
      : {};
  const cover = getCoverArtUrl(metaObj);
  const year = getItemYear(metaObj);
  const metaKeysAll = Object.keys(metaObj).sort((a, b) => a.localeCompare(b));
  const metaKeys = metaKeysAll.filter(
    (k) =>
      k !== "cover_art" &&
      !k.startsWith("catalog_") &&
      k !== "tv_edition" &&
      k !== "tv_season",
  );
  const tvEditionLine = getTvEditionSummary(item);
  const hasDetailRows = metaKeys.length > 0 || tvEditionLine !== "";

  const enrichmentMoreHref =
    enrichment?.synopsis && enrichment.source && enrichment.source_url
      ? safeHttpUrl(enrichment.source_url)
      : null;

  return (
    <>
      <PageHeroUnsplash>
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-xl border border-kurator-border/60 bg-kurator-bg shadow-surface sm:mx-0 sm:w-44">
          <ItemCoverImage
            url={cover}
            alt={`Cover for ${item.title}`}
            className="aspect-2/3 w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h1 className="kurator-item-title text-2xl font-semibold text-kurator-fg md:text-3xl">{item.title}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="inline-flex rounded-full bg-kurator-border/60 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-kurator-muted">
              {categoryLabel(item.category)}
            </span>
            {year ? (
              <span className="text-sm text-kurator-muted">
                Year <span className="text-kurator-fg">{year}</span>
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col items-center gap-1 sm:items-start">
            <span className="text-xs font-medium uppercase tracking-wide text-kurator-muted">Rating</span>
            <ItemStarRating
              value={item.rating ?? null}
              onChange={(n) => void saveRating(n)}
              disabled={ratingBusy}
            />
            {ratingError ? (
              <p className="text-xs text-red-400" role="alert">
                {ratingError}
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex w-full max-w-xs flex-col gap-1 sm:max-w-none">
            <label htmlFor="item-consumption" className="text-xs font-medium uppercase tracking-wide text-kurator-muted">
              Status
            </label>
            <select
              id="item-consumption"
              value={normalizeConsumptionStatus(item)}
              disabled={consumptionBusy}
              onChange={(e) => void saveConsumption(e.target.value as ConsumptionStatus)}
              className="rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            >
              <option value="pending">{consumptionPendingLabel(item.category)}</option>
              <option value="done">{consumptionDoneLabel(item.category)}</option>
            </select>
            {consumptionError ? (
              <p className="text-xs text-red-400" role="alert">
                {consumptionError}
              </p>
            ) : null}
          </div>
          <dl className="mt-4 grid gap-2 text-left text-xs text-kurator-muted sm:grid-cols-2">
            <div>
              <dt className="font-medium uppercase tracking-wide">Collection</dt>
              <dd className="mt-0.5">
                {canEditCollectionLocation ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                    <select
                      aria-label="Shelf for this item"
                      value={item.collection_id ?? ""}
                      disabled={collectionMoveBusy}
                      onChange={(e) => void saveCollectionMove(e.target.value)}
                      className="max-w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 sm:max-w-xs"
                    >
                      {!item.collection_id ? <option value="">Move to shelf…</option> : null}
                      {moveTargetCollections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {(c.name || "").trim() || "Untitled shelf"}
                        </option>
                      ))}
                    </select>
                    {item.collection_id ? (
                      <Link
                        href={`/collections/${item.collection_id}`}
                        className="shrink-0 text-sm text-kurator-accent hover:underline"
                      >
                        Open shelf
                      </Link>
                    ) : null}
                  </div>
                ) : item.collection_id ? (
                  <Link
                    href={`/collections/${item.collection_id}`}
                    className="text-sm text-kurator-accent hover:underline"
                  >
                    {collectionName ?? "Open collection"}
                  </Link>
                ) : (
                  <span className="text-sm text-kurator-muted">Not on a shelf</span>
                )}
                {collectionMoveError ? (
                  <p className="mt-1 text-xs text-red-400" role="alert">
                    {collectionMoveError}
                  </p>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide">Added</dt>
              <dd className="mt-0.5 text-sm text-kurator-fg">
                {new Date(item.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide">Updated</dt>
              <dd className="mt-0.5 text-sm text-kurator-fg">
                {new Date(item.updated_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
          </dl>
        </div>
      </header>
      </PageHeroUnsplash>

      <div className="mx-auto max-w-5xl">
      <Link
        href={item.collection_id ? `/collections/${item.collection_id}` : "/collections"}
        className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {item.collection_id
          ? collectionName
            ? `Back to ${collectionName}`
            : "Back to Collection"
          : "Back to Collections"}
      </Link>

      {itemLists.length > 0 ? (
        <section className="mb-8" aria-labelledby="item-in-lists-heading">
          <h2 id="item-in-lists-heading" className="text-sm font-semibold uppercase tracking-wide text-kurator-muted">
            Hitlists containing this item
          </h2>
          <div className="mt-3 space-y-2">
            {itemLists.map((list) => (
              <h3
                key={list.id}
                className="flex items-center gap-3 text-lg font-semibold text-kurator-fg"
              >
                {list.cover_art_url ? (
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
                    <ItemCoverImage
                      url={list.cover_art_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                ) : null}
                <Link
                  href={hitlistBrowsePath({
                    id: list.id,
                    slug: list.slug,
                    visibility: visibilityOf(list),
                    preferAppView: !!user,
                  })}
                  className="text-kurator-accent hover:underline"
                >
                  {list.name.trim() || "Untitled list"}
                </Link>
              </h3>
            ))}
          </div>
        </section>
      ) : null}

      {(enrichment?.synopsis || enrichment?.note || enrichment?.source) && (
        <section className="mb-8 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-4 md:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-kurator-muted">Synopsis</h2>
          {enrichment?.synopsis ? (
            <>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-kurator-fg">{enrichment.synopsis}</p>
              {enrichment.source && (
                <p className="mt-3 text-xs text-kurator-muted">
                  {enrichmentMoreHref ? (
                    <>
                      More at{" "}
                      <a
                        href={enrichmentMoreHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-kurator-accent hover:underline"
                      >
                        {enrichment.source}
                      </a>
                    </>
                  ) : (
                    <span>More at {enrichment.source}</span>
                  )}
                </p>
              )}
            </>
          ) : (
            enrichment?.note && (
              <p className="mt-3 text-sm text-kurator-muted/90" role="status">
                {enrichment.note}
              </p>
            )
          )}
        </section>
      )}

      <section className="rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-4 md:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-kurator-muted">Details</h2>

        {!hasDetailRows ? (
          <p className="mt-4 text-sm text-kurator-muted">Nothing else recorded yet.</p>
        ) : (
          <dl className="mt-6 space-y-4">
            {tvEditionLine ? (
              <div className="border-b border-kurator-border/50 pb-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-kurator-muted">Set</dt>
                <dd className="mt-1 text-sm text-kurator-fg">{tvEditionLine}</dd>
              </div>
            ) : null}
            {metaKeys.map((key) => (
              <div key={key} className="border-b border-kurator-border/50 pb-4 last:border-0 last:pb-0">
                <dt className="font-mono text-xs font-medium text-kurator-accent">{key}</dt>
                <dd className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-kurator-fg">
                  {formatMetaValue(metaObj[key])}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      </div>
    </>
  );
}
