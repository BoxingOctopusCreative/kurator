"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { hitlistHeroCollageDisplay } from "@/lib/hitlistHeroCollage";
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
  /**
   * Hitlists: ordered unique entry cover URLs. When non-empty, the hero shows **only** this mosaic
   * (custom/Unsplash banner is hidden until covers are cleared from the list).
   */
  collageCoverUrls?: string[] | null;
};

/** Full width of the app main column (`@container` on the column wrapper in AppChrome). */
export const MAIN_COLUMN_BREAKOUT_CLASS =
  "relative w-[100cqw] max-w-none shrink-0 overflow-hidden rounded-none border-x-0 border-b border-kurator-border [margin-inline:calc((100%-100cqw)/2)]";

/** Full-width breakout without `overflow-hidden`, so children (e.g. dropdowns) can extend past the row. Use `z-10` so it stacks above the page hero (`z-0`). */
export const MAIN_COLUMN_BRAND_STRIP_CLASS =
  "relative z-10 w-[100cqw] max-w-none shrink-0 overflow-visible rounded-none border-x-0 border-b border-kurator-border [margin-inline:calc((100%-100cqw)/2)]";

const pullToMainTopClass = "-mt-5 md:-mt-8";
/** Restores vertical rhythm after cancelling `main` top padding (`py-5` + `md:py-8`). */
const contentTopPadWhenPulled = "pt-12 md:pt-[calc(2rem+2.25rem)]";

function HeroHitlistCoverCollage({ uniqueUrls }: { uniqueUrls: string[] }) {
  const display = hitlistHeroCollageDisplay(uniqueUrls);
  if (!display) return null;
  const { layout, urls } = display;
  if (layout === "strip") {
    return (
      <div className="absolute inset-0 flex gap-px bg-black/25">
        {urls.map((url, i) => (
          <div key={`${i}-${url}`} className="min-h-0 min-w-0 flex-1 overflow-hidden bg-kurator-bg">
            <ItemCoverImage url={url} alt="" className="h-full w-full object-cover object-center" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 gap-px bg-black/25">
      {urls.map((url, i) => (
        <div key={`${i}-${url}`} className="min-h-0 min-w-0 overflow-hidden bg-kurator-bg">
          <ItemCoverImage url={url} alt="" className="h-full w-full object-cover object-center" />
        </div>
      ))}
    </div>
  );
}

/**
 * Title-area hero with a dark-tinted background: optional shelf `customBackgroundUrl`, otherwise
 * an Unsplash landscape (random query from curated list).
 * Hitlists may pass `collageCoverUrls`; when present, entry-cover mosaic **replaces** the banner (custom or Unsplash).
 * Spans the full main column width (grows when the sidebar collapses). Reuses a cached Unsplash banner for up to one hour per route (browser + CDN-friendly API cache), then fetches a new image when no custom URL is set.
 */
export function PageHeroUnsplash({
  children,
  className = "",
  bleedBottomMargin = true,
  bleedToMainTop = true,
  customBackgroundUrl = null,
  collageCoverUrls = null,
}: Props) {
  const pathname = usePathname();
  const [bg, setBg] = useState<UnsplashBackgroundPayload | null>(null);
  const customTrimmed = customBackgroundUrl?.trim() ?? "";
  const customSrc = customTrimmed ? safeImageSrcUrl(customTrimmed) : null;
  const useCustomBackground = Boolean(customSrc);
  const collageUniqueUrls =
    collageCoverUrls?.filter((u) => typeof u === "string" && u.trim() !== "") ?? [];
  const collageReplacesBanner = collageUniqueUrls.length > 0;

  useEffect(() => {
    let cancelled = false;
    if (customSrc || collageReplacesBanner) {
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
  }, [pathname, customSrc, collageReplacesBanner]);

  const backgroundImageSrc =
    !collageReplacesBanner && !useCustomBackground && bg ? safeImageSrcUrl(bg.url) : null;
  const photoPageHref = bg?.photoPageUrl ? safeHttpUrl(bg.photoPageUrl) : null;
  const photographerPageHref = bg?.photographerUrl ? safeHttpUrl(bg.photographerUrl) : null;

  const contentPadClass = bleedToMainTop ? `px-5 pb-7 md:px-8 md:pb-9 ${contentTopPadWhenPulled}` : "px-5 py-7 md:px-8 md:py-9";

  const heroBackgroundInner = collageReplacesBanner ? (
    <HeroHitlistCoverCollage uniqueUrls={collageUniqueUrls} />
  ) : useCustomBackground ? (
    <ItemCoverImage
      url={customTrimmed}
      alt=""
      className="absolute inset-0 h-full w-full object-cover object-center"
    />
  ) : backgroundImageSrc ? (
    <div className="absolute inset-0">
      <Image
        alt=""
        src={backgroundImageSrc}
        fill
        className="object-cover object-center border-0! shadow-none! outline-none! ring-0"
        sizes="(max-width: 768px) 100vw, min(1600px, 100vw)"
        fetchPriority="low"
      />
    </div>
  ) : (
    <div className="pointer-events-none absolute inset-0 bg-kurator-border/30" aria-hidden />
  );

  return (
    <section
      data-kurator-page-hero
      className={`relative isolate z-0 min-h-42 md:min-h-48 shadow-hero-bottom ${MAIN_COLUMN_BREAKOUT_CLASS} ${bleedToMainTop ? pullToMainTopClass : ""} ${bleedBottomMargin ? "mb-8" : ""} ${className}`.trim()}
      aria-label="Page header"
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-kurator-bg">{heroBackgroundInner}</div>
      <div className="pointer-events-none absolute inset-0 z-1 bg-black/45" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 z-2 bg-kurator-bg/70 backdrop-blur-[0.5px]"
        aria-hidden
      />

      <div className={`relative z-10 ${contentPadClass}`}>{children}</div>

      {!collageReplacesBanner && !useCustomBackground && bg?.url ? (
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
