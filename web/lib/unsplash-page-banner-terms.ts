/**
 * Search terms for in-app page title hero banners (Unsplash).
 * One term is chosen at random per fetch; see `fetchUnsplashPageBanner`.
 */
export const PAGE_BANNER_SEARCH_TERMS = [
  "collection",
  "games",
  "video games",
  "books",
  "manga",
  "comic books",
  "anime",
  "movies",
  "tv",
  "music",
] as const;

/** Unsplash queries for legal document pages (privacy, terms, sitemap). */
export const LEGAL_PAGE_BANNER_SEARCH_TERMS = ["collection", "collector", "hobby"] as const;

/** Path-specific Unsplash search terms (exact pathname, e.g. `/settings/theme/marketplace`). */
export const PAGE_BANNER_SEARCH_TERMS_BY_PATH: Record<string, readonly string[]> = {
  "/privacy": LEGAL_PAGE_BANNER_SEARCH_TERMS,
  "/terms": LEGAL_PAGE_BANNER_SEARCH_TERMS,
  "/sitemap": LEGAL_PAGE_BANNER_SEARCH_TERMS,
  "/settings/theme/marketplace": ["art", "creative", "theme"],
};

export function pageBannerSearchTerms(path: string): readonly string[] {
  return PAGE_BANNER_SEARCH_TERMS_BY_PATH[path] ?? PAGE_BANNER_SEARCH_TERMS;
}
