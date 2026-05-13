"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";
import { readPageHeroBannerCache, writePageHeroBannerCache } from "@/lib/unsplash-page-hero-cache";
import { safeHttpUrl, safeImageSrcUrl } from "@/lib/safeUrl";

type Props = {
  children: ReactNode;
  /** Extra classes on the outer section (layout, spacing). */
  className?: string;
  /** When false, no bottom margin (e.g. hero nested inside a page header that already sets spacing). */
  bleedBottomMargin?: boolean;
  /**
   * When true (default), cancel the main column’s top padding so the image meets the top of the scroll area.
   * Set false when something already sits above this hero (e.g. back link, shelf cover).
   */
  bleedToMainTop?: boolean;
  /**
   * When set (non-empty after trim), uses this image as the hero background instead of the Unsplash banner.
   */
  customBackgroundUrl?: string | null;
};

/** Full width of the app main column (`@container` on the column wrapper in AppChrome). */
const mainColumnBreakout =
  "relative w-[100cqw] max-w-none shrink-0 overflow-hidden rounded-none border-x-0 border-b border-kurator-border [margin-inline:calc((100%-100cqw)/2)]";

const pullToMainTopClass = "-mt-5 md:-mt-8";
/** Restores vertical rhythm after cancelling `main` top padding (`py-5` + `md:py-8`). */
const contentTopPadWhenPulled = "pt-12 md:pt-[calc(2rem+2.25rem)]";

/**
 * Title-area hero with a dark-tinted background: optional shelf `customBackgroundUrl`, otherwise
 * an Unsplash landscape (random query from curated list).
 * Spans the full main column width (grows when the sidebar collapses). Reuses a cached Unsplash banner for up to one hour per route (browser + CDN-friendly API cache), then fetches a new image when no custom URL is set.
 */
export function PageHeroUnsplash({
  children,
  className = "",
  bleedBottomMargin = true,
  bleedToMainTop = true,
  customBackgroundUrl = null,
}: Props) {
  const pathname = usePathname();
  const [bg, setBg] = useState<UnsplashBackgroundPayload | null>(null);
  const customTrimmed = customBackgroundUrl?.trim() ?? "";
  const customSrc = customTrimmed ? safeImageSrcUrl(customTrimmed) : null;
  const useCustomBackground = Boolean(customSrc);

  useEffect(() => {
    let cancelled = false;
    if (customSrc) {
      setBg(null);
      return () => {
        cancelled = true;
      };
    }

    const cached = readPageHeroBannerCache(pathname);
    if (cached?.url) {
      setBg(cached);
      return () => {
        cancelled = true;
      };
    }

    setBg(null);
    const pathParam = encodeURIComponent(pathname || "/");
    void fetch(`/api/unsplash-page-banner?path=${pathParam}`, { cache: "default" })
      .then(async (r) => {
        if (r.status === 204) return;
        if (!r.ok) return;
        const data = (await r.json()) as UnsplashBackgroundPayload | null;
        if (!cancelled && data?.url) {
          setBg(data);
          writePageHeroBannerCache(pathname, data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname, customSrc]);

  const backgroundImageSrc = !useCustomBackground && bg ? safeImageSrcUrl(bg.url) : null;
  const photoPageHref = bg?.photoPageUrl ? safeHttpUrl(bg.photoPageUrl) : null;
  const photographerPageHref = bg?.photographerUrl ? safeHttpUrl(bg.photographerUrl) : null;

  const contentPadClass = bleedToMainTop ? `px-5 pb-7 md:px-8 md:pb-9 ${contentTopPadWhenPulled}` : "px-5 py-7 md:px-8 md:py-9";

  return (
    <section
      data-kurator-page-hero
      className={`relative isolate min-h-42 md:min-h-48 shadow-hero-bottom ${mainColumnBreakout} ${bleedToMainTop ? pullToMainTopClass : ""} ${bleedBottomMargin ? "mb-8" : ""} ${className}`.trim()}
      aria-label="Page header"
    >
      {useCustomBackground ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-0 bg-kurator-bg">
            <ItemCoverImage
              url={customTrimmed}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-1 bg-black/45" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 z-2 bg-kurator-bg/70 backdrop-blur-[0.5px]"
            aria-hidden
          />
        </>
      ) : backgroundImageSrc ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-0 bg-kurator-bg">
            <Image
              alt=""
              src={backgroundImageSrc}
              fill
              className="object-cover object-center border-0! shadow-none! outline-none! ring-0"
              sizes="(max-width: 768px) 100vw, min(1600px, 100vw)"
              fetchPriority="low"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-1 bg-black/45" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 z-2 bg-kurator-bg/70 backdrop-blur-[0.5px]"
            aria-hidden
          />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 z-0 bg-kurator-border/30" aria-hidden />
      )}

      <div className={`relative z-10 ${contentPadClass}`}>{children}</div>

      {!useCustomBackground && bg?.url ? (
        <p className="relative z-10 px-4 pb-3 pt-1 text-center text-[11px] text-kurator-muted">
          Background:{" "}
          {photoPageHref ? (
            <a
              href={photoPageHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-kurator-muted underline decoration-kurator-border underline-offset-2 hover:text-kurator-fg"
            >
              Photo
            </a>
          ) : (
            <span>Photo</span>
          )}
          {bg.photographer ? (
            <>
              {" "}
              by{" "}
              {photographerPageHref ? (
                <a
                  href={photographerPageHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kurator-muted underline decoration-kurator-border underline-offset-2 hover:text-kurator-fg"
                >
                  {bg.photographer}
                </a>
              ) : (
                bg.photographer
              )}
            </>
          ) : null}{" "}
          on{" "}
          <a
            href="https://unsplash.com/?utm_source=kurator&utm_medium=referral"
            target="_blank"
            rel="noopener noreferrer"
            className="text-kurator-muted underline decoration-kurator-border underline-offset-2 hover:text-kurator-fg"
          >
            Unsplash
          </a>
        </p>
      ) : null}
    </section>
  );
}
