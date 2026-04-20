"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Item, ItemEnrichment } from "@/lib/api";
import { fetchItem, fetchItemEnrichment, updateItem } from "@/lib/api";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ItemStarRating } from "@/components/ItemStarRating";
import { categoryLabel } from "@/lib/categoryLabels";
import { getCoverArtUrl, getItemYear } from "@/lib/itemDisplay";
import { safeHttpUrl } from "@/lib/safeUrl";

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
  const idRaw = params.id;
  const id = typeof idRaw === "string" ? Number(idRaw) : NaN;

  const [item, setItem] = useState<Item | null>(null);
  const [enrichment, setEnrichment] = useState<ItemEnrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setError("Invalid item.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEnrichment(null);
    fetchItem(id)
      .then(async (data) => {
        if (cancelled) return;
        setItem(data);
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
      });
      setItem(updated);
    } catch (e: unknown) {
      setRatingError(e instanceof Error ? e.message : "Could not save rating.");
    } finally {
      setRatingBusy(false);
    }
  }

  if (!Number.isFinite(id) || id < 1) {
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
  const catalogKeys = metaKeysAll.filter((k) => k.startsWith("catalog_"));
  const showLinkedLookups = item.category !== "book" && catalogKeys.length > 0;
  const metaKeys = metaKeysAll.filter(
    (k) => !k.startsWith("catalog_") && k !== "cover_art"
  );
  const hasDetailRows = metaKeys.length > 0 || showLinkedLookups;

  const enrichmentMoreHref =
    enrichment?.synopsis && enrichment.source && enrichment.source_url
      ? safeHttpUrl(enrichment.source_url)
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/collections/${item.collection_id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to collection
      </Link>

      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-xl border border-kurator-border/60 bg-kurator-bg sm:mx-0 sm:w-44">
          <ItemCoverImage
            url={cover}
            alt={`Cover for ${item.title}`}
            className="aspect-2/3 w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">{item.title}</h1>
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
          <dl className="mt-4 grid gap-2 text-left text-xs text-kurator-muted sm:grid-cols-2">
            <div>
              <dt className="font-medium uppercase tracking-wide">Item ID</dt>
              <dd className="mt-0.5 font-mono text-sm text-kurator-fg">{item.id}</dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide">Collection</dt>
              <dd className="mt-0.5">
                <Link
                  href={`/collections/${item.collection_id}`}
                  className="text-sm text-kurator-accent hover:underline"
                >
                  Open collection #{item.collection_id}
                </Link>
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

      {(enrichment?.synopsis || enrichment?.note || enrichment?.source) && (
        <section className="mb-8 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 md:p-6">
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

      <section className="rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 md:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-kurator-muted">Details</h2>

        {!hasDetailRows ? (
          <p className="mt-4 text-sm text-kurator-muted">Nothing else recorded yet.</p>
        ) : (
          <dl className="mt-6 space-y-4">
            {metaKeys.map((key) => (
              <div key={key} className="border-b border-kurator-border/50 pb-4 last:border-0 last:pb-0">
                <dt className="font-mono text-xs font-medium text-kurator-accent">{key}</dt>
                <dd className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-kurator-fg">
                  {formatMetaValue(metaObj[key])}
                </dd>
              </div>
            ))}
            {showLinkedLookups && (
              <div className="border-t border-kurator-border/50 pt-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-kurator-muted">Linked lookups</dt>
                <dd className="mt-2 space-y-3">
                  {catalogKeys.map((key) => (
                    <div key={key}>
                      <span className="font-mono text-xs text-kurator-accent/90">{key}</span>
                      <p className="mt-0.5 whitespace-pre-wrap wrap-break-word text-sm text-kurator-fg">
                        {formatMetaValue(metaObj[key])}
                      </p>
                    </div>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>
    </div>
  );
}
