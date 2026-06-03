"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  exploreSearchKindLabel,
  fetchExploreSearch,
  type ExploreSearchHit,
} from "@/lib/exploreSearch";
import { useActiveCustomThemeLogo } from "@/lib/useActiveCustomThemeLogo";

const KURATOR_FAVICON =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-white.svg";

function SearchFieldIcon() {
  const customLogo = useActiveCustomThemeLogo();
  if (customLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={customLogo}
        alt=""
        className="h-4 w-4 object-contain invert"
        aria-hidden
      />
    );
  }
  return (
    <Image
      src={KURATOR_FAVICON}
      alt=""
      width={16}
      height={16}
      className="h-4 w-4"
      aria-hidden
    />
  );
}

const MIN_LEN = 2;
const DEBOUNCE_MS = 300;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function GlobalSearchBar({ className = "" }: { className?: string }) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<ExploreSearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const runSearch = useCallback(async () => {
    if (debounced.length < MIN_LEN) {
      setHits(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchExploreSearch(debounced, 6);
      setHits(res.hits);
    } catch (e) {
      setHits([]);
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showPanel = open && debounced.length >= MIN_LEN;
  const empty = hits !== null && hits.length === 0 && !loading && !error;

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center">
          <SearchFieldIcon />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search Kurator…"
          aria-label="Search shelves, boards, people, and more"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listboxId : undefined}
          aria-autocomplete="list"
          role="combobox"
          className="w-full rounded-lg border border-kurator-border/80 bg-kurator-surface/10 py-2 pl-9 pr-3 text-sm text-kurator-fg placeholder:text-kurator-muted/70 focus:border-kurator-border focus:bg-kurator-surface/15 focus:outline-none focus:ring-2 focus:ring-kurator-accent/40"
        />
      </div>
      {showPanel ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-kurator-border bg-kurator-topbar py-1 shadow-dropdown"
        >
          {loading ? (
            <p className="px-3 py-3 text-center text-xs text-kurator-muted">Searching…</p>
          ) : null}
          {error ? (
            <p className="px-3 py-3 text-center text-xs text-red-400">{error}</p>
          ) : null}
          {empty ? (
            <p className="px-3 py-3 text-center text-xs text-kurator-muted">No results.</p>
          ) : null}
          {hits?.map((hit) => (
            <Link
              key={`${hit.kind}-${hit.id}-${hit.url}`}
              href={hit.url}
              role="option"
              className="block px-3 py-2 transition-colors hover:bg-kurator-border/40"
              onClick={() => {
                setOpen(false);
                setQ("");
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-kurator-muted">
                {exploreSearchKindLabel(hit.kind)}
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium text-kurator-fg">
                {truncate(hit.title, 120)}
              </span>
              {hit.subtitle ? (
                <span className="mt-0.5 block truncate text-xs text-kurator-muted">
                  {truncate(hit.subtitle, 80)}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
