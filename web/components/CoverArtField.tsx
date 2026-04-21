"use client";

import { useId, useState } from "react";
import { CircleHelp } from "lucide-react";
import { importCoverImageFromUrl, uploadCoverImage } from "@/lib/api";
import type { UnsplashCoverSearchHit } from "@/lib/unsplash-cover-search.types";
import { assertHttpOrHttpsUrl } from "@/lib/validation";

type Props = {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
};

export function CoverArtField({ value, onChange, disabled = false }: Props) {
  const id = useId();
  const fileInputId = `${id}-file`;
  const unsplashInputId = `${id}-unsplash-q`;
  const [importUrl, setImportUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsplashQuery, setUnsplashQuery] = useState("");
  const [unsplashHits, setUnsplashHits] = useState<UnsplashCoverSearchHit[]>([]);
  const [unsplashPage, setUnsplashPage] = useState(1);
  const [unsplashTotalPages, setUnsplashTotalPages] = useState(1);
  const [unsplashSearching, setUnsplashSearching] = useState(false);
  const [unsplashError, setUnsplashError] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setError(file ? "Choose an image file (JPEG, PNG, GIF, or WebP)." : null);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const url = await uploadCoverImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onImportFromRemote() {
    const u = importUrl.trim();
    if (!u) {
      setError("Enter an image URL.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const safe = assertHttpOrHttpsUrl(u, "Image URL");
      const url = await importCoverImageFromUrl(safe);
      onChange(url);
      setImportUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onSearchUnsplash(requestedPage = 1) {
    const q = unsplashQuery.trim();
    if (!q) {
      setUnsplashError("Enter a search term.");
      setUnsplashHits([]);
      setUnsplashPage(1);
      setUnsplashTotalPages(1);
      return;
    }
    setUnsplashError(null);
    setUnsplashSearching(true);
    try {
      const res = await fetch(
        `/api/unsplash-cover-search?q=${encodeURIComponent(q)}&page=${encodeURIComponent(String(requestedPage))}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        photos?: UnsplashCoverSearchHit[];
        page?: number;
        totalPages?: number;
        message?: string;
        error?: string;
      };
      if (res.status === 503 && data.error === "no_key") {
        setUnsplashHits([]);
        setUnsplashPage(1);
        setUnsplashTotalPages(1);
        setUnsplashError(data.message ?? "Unsplash search is not configured.");
        return;
      }
      if (!res.ok) {
        setUnsplashHits([]);
        setUnsplashPage(1);
        setUnsplashTotalPages(1);
        setUnsplashError(data.message ?? "Search failed.");
        return;
      }
      const hits = Array.isArray(data.photos) ? data.photos : [];
      setUnsplashHits(hits);
      const pg =
        typeof data.page === "number" && Number.isFinite(data.page) && data.page >= 1
          ? Math.floor(data.page)
          : requestedPage;
      const tp =
        typeof data.totalPages === "number" && Number.isFinite(data.totalPages) && data.totalPages >= 1
          ? Math.floor(data.totalPages)
          : 1;
      setUnsplashPage(pg);
      setUnsplashTotalPages(tp);
      if (!hits.length) {
        setUnsplashError("No photos found. Try different words.");
      }
    } catch {
      setUnsplashHits([]);
      setUnsplashPage(1);
      setUnsplashTotalPages(1);
      setUnsplashError("Search failed.");
    } finally {
      setUnsplashSearching(false);
    }
  }

  async function onPickUnsplash(hit: UnsplashCoverSearchHit) {
    setError(null);
    setUnsplashError(null);
    setBusy(true);
    try {
      await fetch("/api/unsplash-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hit.id }),
      });
      const safe = assertHttpOrHttpsUrl(hit.importUrl, "Image URL");
      const url = await importCoverImageFromUrl(safe);
      onChange(url);
      setUnsplashHits([]);
      setUnsplashQuery("");
      setUnsplashPage(1);
      setUnsplashTotalPages(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-kurator-border bg-kurator-bg/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-kurator-muted">Cover Art</span>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-16 w-16 rounded-md border border-kurator-border object-cover"
          />
        ) : (
          <span className="text-xs text-kurator-muted/80">No image</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="sr-only"
          onChange={onPickFile}
          disabled={busy || disabled}
        />
        <label
          htmlFor={fileInputId}
          className="inline-flex cursor-pointer rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-xs font-medium text-kurator-fg hover:bg-kurator-surface disabled:opacity-50"
        >
          {busy ? "…" : "Upload File"}
        </label>
        {value ? (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => onChange("")}
            className="rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-xs font-medium text-kurator-muted hover:border-red-500/40 hover:text-red-200 disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 text-sm">
          <span className="text-kurator-muted">Import From URL</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://…"
            disabled={busy || disabled}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void onImportFromRemote()}
          className="shrink-0 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-xs font-medium text-kurator-fg hover:bg-kurator-surface disabled:opacity-50"
        >
          Import
        </button>
      </div>

      <div className="border-t border-kurator-border/60 pt-3">
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-wider text-kurator-muted">Or</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm" htmlFor={unsplashInputId}>
            <span className="group relative inline-flex items-center gap-1.5 text-kurator-muted">
              <span>Search Unsplash</span>
              <button
                type="button"
                className="-m-0.5 inline-flex shrink-0 rounded-sm p-0.5 text-kurator-muted hover:text-kurator-fg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                aria-label="Search Unsplash for cover art. Choosing a photo stores a copy in your library and triggers Unsplash download tracking."
              >
                <CircleHelp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-1.5 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              >
                Search Unsplash for cover art. Choosing a photo stores a copy in your library and triggers Unsplash
                download tracking.
              </span>
            </span>
            <input
              id={unsplashInputId}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={unsplashQuery}
              onChange={(e) => setUnsplashQuery(e.target.value)}
              placeholder="e.g. vinyl records, bookshelf"
              disabled={busy || disabled}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onSearchUnsplash(1);
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy || disabled || unsplashSearching}
            onClick={() => void onSearchUnsplash(1)}
            className="shrink-0 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-xs font-medium text-kurator-fg hover:bg-kurator-surface disabled:opacity-50"
          >
            {unsplashSearching ? "Searching…" : "Search"}
          </button>
        </div>
        {unsplashError && (
          <p className="mt-2 text-xs text-amber-200/90" role="status">
            {unsplashError}
          </p>
        )}
        {(unsplashHits.length > 0 || unsplashPage > 1) && (
          <>
            {unsplashHits.length > 0 ? (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Unsplash results">
                {unsplashHits.map((hit) => (
                  <li key={hit.id} className="min-w-0">
                    <button
                      type="button"
                      disabled={busy || disabled}
                      onClick={() => void onPickUnsplash(hit)}
                      className="group w-full overflow-hidden rounded-lg border border-kurator-border bg-kurator-bg text-left ring-kurator-accent focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={hit.thumbUrl}
                        alt=""
                        className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
                      />
                    </button>
                    <p className="mt-1 truncate text-[10px] leading-tight text-kurator-muted">
                      {hit.photographerUrl ? (
                        <a
                          href={hit.photographerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-kurator-border underline-offset-1 hover:text-kurator-fg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {hit.photographer}
                        </a>
                      ) : (
                        hit.photographer
                      )}
                      {hit.photoPageUrl ? (
                        <>
                          {" · "}
                          <a
                            href={hit.photoPageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-kurator-border underline-offset-1 hover:text-kurator-fg"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Unsplash
                          </a>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {(unsplashTotalPages > 1 || unsplashPage > 1) && (
              <nav
                className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-kurator-border/40 pt-3"
                aria-label="Unsplash results pages"
              >
                <button
                  type="button"
                  disabled={busy || disabled || unsplashSearching || unsplashPage <= 1}
                  onClick={() => void onSearchUnsplash(unsplashPage - 1)}
                  className="rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-xs font-medium text-kurator-fg hover:bg-kurator-surface disabled:opacity-50"
                >
                  Previous
                </button>
                <p className="text-xs text-kurator-muted">
                  Page {unsplashPage} of {unsplashTotalPages}
                </p>
                <button
                  type="button"
                  disabled={busy || disabled || unsplashSearching || unsplashPage >= unsplashTotalPages}
                  onClick={() => void onSearchUnsplash(unsplashPage + 1)}
                  className="rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-xs font-medium text-kurator-fg hover:bg-kurator-surface disabled:opacity-50"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
