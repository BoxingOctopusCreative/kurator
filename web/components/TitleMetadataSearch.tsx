"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { Category } from "@/lib/api";
import type { CategoryFormSlice } from "@/components/CategoryMetadataFields";
import { fetchMetadataLookup, type MetadataHit, type MetadataLookupResponse } from "@/lib/api";

type Props = {
  category: Category;
  title: string;
  onApply: (payload: { title?: string; slice: Partial<CategoryFormSlice> }) => void;
};

/** Short tag for where a match came from (kept generic in the UI). */
const labels: Record<string, string> = {
  discogs: "Music",
  thegamesdb: "Games",
  openlibrary: "Books",
  googlebooks: "Books",
  tmdb: "Film & TV",
  jikan: "Manga",
  comicvine: "Comics",
  comic: "Match",
  book: "Match",
};

const lookupCategories: Category[] = [
  "music",
  "game",
  "book",
  "movies",
  "tv",
  "anime",
  "comic_book",
  "manga",
];

export function TitleMetadataSearch({ category, title, onApply }: Props) {
  const enabled = lookupCategories.includes(category);
  const [data, setData] = useState<MetadataLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const q = title.trim();
    if (q.length < 2) {
      setData(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setErr(null);
      fetchMetadataLookup(category, q)
        .then((res) => {
          if (!cancelled) setData(res);
        })
        .catch((e: unknown) => {
          if (!cancelled) setErr(e instanceof Error ? e.message : "Lookup failed.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [category, enabled, title]);

  if (!enabled) return null;

  function applyHit(hit: MetadataHit) {
    if (category === "music") {
      onApply({
        title: hit.title || undefined,
        slice: {
          artist: hit.artist,
          album: hit.album,
          year: hit.year != null ? String(hit.year) : undefined,
          cover_art: hit.thumb_url || undefined,
        },
      });
      return;
    }
    if (category === "game") {
      onApply({
        title: hit.title || undefined,
        slice: {
          platform: hit.platform || undefined,
          year: hit.year != null ? String(hit.year) : undefined,
          cover_art: hit.thumb_url || undefined,
          catalog_gamesdb_id: hit.external_id,
        },
      });
      return;
    }
    if (category === "book") {
      const olKey =
        (typeof hit.extra?.open_library_key === "string" && hit.extra.open_library_key) ||
        (hit.source === "openlibrary" ? hit.external_id : undefined);
      onApply({
        title: hit.title || undefined,
        slice: {
          author: hit.author,
          publisher: hit.publisher,
          year: hit.year != null ? String(hit.year) : undefined,
          isbn: hit.isbn,
          cover_art: hit.thumb_url || undefined,
          ...(hit.source === "googlebooks"
            ? {
                catalog_google_books_id: hit.external_id,
                catalog_open_library_key: undefined,
              }
            : hit.source === "openlibrary"
              ? {
                  catalog_open_library_key: olKey,
                  catalog_google_books_id: undefined,
                }
              : {}),
        },
      });
      return;
    }
    if (category === "movies" || category === "tv" || category === "anime") {
      const mt = (hit.extra?.media_type as string) || "";
      const tmdbMedia = mt === "tv" ? "tv" : mt === "movie" ? "movie" : undefined;
      const videoType =
        category === "tv"
          ? "series"
          : category === "anime"
            ? "anime"
            : mt === "tv"
              ? "series"
              : "movie";
      onApply({
        title: hit.title || undefined,
        slice: {
          year: hit.year != null ? String(hit.year) : undefined,
          genre: hit.genre,
          cover_art: hit.thumb_url || undefined,
          video_type: videoType,
          catalog_tmdb_id: hit.external_id,
          catalog_tmdb_media_type: tmdbMedia,
        },
      });
      return;
    }
    if (category === "comic_book") {
      const ex = hit.extra ?? {};
      const kind = ex.comicvine_resource as string | undefined;
      const issueNum = typeof ex.issue_number === "string" ? ex.issue_number : undefined;
      let singleIssue: boolean | undefined;
      if (kind === "issue") {
        singleIssue = true;
      } else if (kind === "volume") {
        singleIssue = false;
      }
      const olKey =
        (typeof ex.open_library_key === "string" && ex.open_library_key) ||
        (hit.source === "openlibrary" ? hit.external_id : undefined);
      const baseSlice: Partial<CategoryFormSlice> = {
        writer: hit.author,
        artist: hit.artist,
        publisher: hit.publisher,
        year: hit.year != null ? String(hit.year) : undefined,
        cover_art: hit.thumb_url || undefined,
        ...(singleIssue !== undefined ? { single_issue: singleIssue } : {}),
        ...(issueNum ? { issue_number: issueNum } : {}),
      };
      if (hit.source === "comicvine") {
        onApply({
          title: hit.title || undefined,
          slice: {
            ...baseSlice,
            catalog_comicvine_id: hit.external_id,
            catalog_comicvine_resource: kind === "issue" ? "issue" : "volume",
            catalog_google_books_id: undefined,
            catalog_open_library_key: undefined,
          },
        });
      } else if (hit.source === "googlebooks") {
        onApply({
          title: hit.title || undefined,
          slice: {
            ...baseSlice,
            catalog_google_books_id: hit.external_id,
            catalog_comicvine_id: undefined,
            catalog_comicvine_resource: undefined,
            catalog_open_library_key: undefined,
          },
        });
      } else if (hit.source === "openlibrary") {
        onApply({
          title: hit.title || undefined,
          slice: {
            ...baseSlice,
            catalog_open_library_key: olKey,
            catalog_comicvine_id: undefined,
            catalog_comicvine_resource: undefined,
            catalog_google_books_id: undefined,
          },
        });
      } else {
        onApply({ title: hit.title || undefined, slice: baseSlice });
      }
      return;
    }
    if (category === "manga") {
      const olKey =
        (typeof hit.extra?.open_library_key === "string" && hit.extra.open_library_key) ||
        (hit.source === "openlibrary" ? hit.external_id : undefined);
      onApply({
        title: hit.title || undefined,
        slice: {
          author: hit.author,
          publisher: hit.publisher,
          year: hit.year != null ? String(hit.year) : undefined,
          isbn: hit.isbn,
          cover_art: hit.thumb_url || undefined,
          ...(hit.source === "jikan"
            ? {
                catalog_mal_id: hit.external_id,
                catalog_google_books_id: undefined,
                catalog_open_library_key: undefined,
              }
            : hit.source === "googlebooks"
              ? {
                  catalog_google_books_id: hit.external_id,
                  catalog_mal_id: undefined,
                  catalog_open_library_key: undefined,
                }
              : hit.source === "openlibrary"
                ? {
                    catalog_open_library_key: olKey,
                    catalog_mal_id: undefined,
                    catalog_google_books_id: undefined,
                  }
                : {}),
        },
      });
    }
  }

  const q = title.trim();
  if (q.length < 2) {
    return (
      <p className="text-xs text-kurator-muted">Type at least two characters in the title to search for matches.</p>
    );
  }

  return (
    <div className="rounded-lg shadow-surface border border-kurator-border bg-kurator-bg/40 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-kurator-muted">
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {loading ? "Searching…" : "Matches"}
      </div>

      {err && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {err}
        </p>
      )}

      {data?.message && (
        <p
          className={`mt-2 text-xs ${data.stub ? "text-amber-200/90" : "text-kurator-muted/90"}`}
        >
          {data.message}
        </p>
      )}

      {!loading && data && !data.stub && data.results && data.results.length === 0 && (
        <p className="mt-2 text-xs text-kurator-muted">No matches.</p>
      )}

      {!loading && data && data.results && data.results.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          {data.results.map((hit, i) => (
            <li key={`${hit.external_id ?? hit.title}-${i}`}>
              <button
                type="button"
                onClick={() => applyHit(hit)}
                className="flex w-full gap-3 rounded-lg border border-kurator-border/80 bg-kurator-surface px-2 py-2 text-left text-sm transition-colors hover:border-kurator-accent/50"
              >
                {hit.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hit.thumb_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-sm bg-kurator-border/50" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-kurator-fg">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="mt-0.5 block text-xs text-kurator-muted">{hit.subtitle}</span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-kurator-muted">
                    {[hit.artist, hit.author, hit.publisher, hit.isbn, hit.genre, hit.platform]
                      .filter(Boolean)
                      .join(" · ")}
                    {hit.year != null ? ` · ${hit.year}` : ""}
                    {hit.source && (
                      <span className="ml-1 text-kurator-muted/70">({labels[hit.source] ?? hit.source})</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
