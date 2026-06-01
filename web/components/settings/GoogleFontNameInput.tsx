"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  filterGoogleFontNames,
  fetchGoogleFontNames,
  GOOGLE_FONT_AUTOCOMPLETE_SAMPLE,
  googleFontFamilyCss,
  googleFontsPreviewHref,
} from "@/lib/customTheme";

type Props = {
  value: string;
  onChange: (name: string) => void;
  className?: string;
};

const PREVIEW_LINK_ATTR = "data-google-font-autocomplete";

export function GoogleFontNameInput({ value, onChange, className = "" }: Props) {
  const listboxId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const previewLinkRef = useRef<HTMLLinkElement | null>(null);
  const [families, setFamilies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchGoogleFontNames()
      .then((names) => {
        if (!cancelled) {
          setFamilies(names);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load Google Fonts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const matches = useMemo(() => filterGoogleFontNames(families, value), [families, value]);
  const previewHref = useMemo(
    () => (open ? googleFontsPreviewHref(matches) : null),
    [open, matches],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    function removePreviewLink() {
      previewLinkRef.current?.remove();
      previewLinkRef.current = null;
    }

    if (!previewHref) {
      removePreviewLink();
      return;
    }

    let link = previewLinkRef.current;
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute(PREVIEW_LINK_ATTR, "true");
      document.head.appendChild(link);
      previewLinkRef.current = link;
    }
    if (link.href !== previewHref) {
      link.href = previewHref;
    }

    return removePreviewLink;
  }, [previewHref]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={loading ? "Loading fonts…" : "Search Google Fonts…"}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (families.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            setOpen(false);
            e.preventDefault();
          }
        }}
      />
      {loadError ? (
        <span className="mt-1 block text-xs text-kurator-muted">{loadError}</span>
      ) : (
        <span className="mt-1 block text-xs text-kurator-muted">
          {loading
            ? "Loading font catalog…"
            : `${families.length.toLocaleString()} Google Fonts available`}
        </span>
      )}
      {open && !loading && families.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-kurator-border bg-kurator-bg py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-kurator-muted">No matches</li>
          ) : (
            matches.map((name) => {
              const fontFamily = googleFontFamilyCss(name);
              return (
                <li key={name} role="option" aria-selected={value === name}>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left hover:bg-kurator-border/40"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                  >
                    <span
                      className="block truncate text-base leading-tight text-kurator-fg"
                      style={{ fontFamily }}
                    >
                      {name}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-xs text-kurator-muted"
                      style={{ fontFamily }}
                    >
                      {GOOGLE_FONT_AUTOCOMPLETE_SAMPLE}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
