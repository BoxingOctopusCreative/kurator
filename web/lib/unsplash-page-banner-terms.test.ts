import { describe, expect, it } from "vitest";
import { LEGAL_PAGE_BANNER_SEARCH_TERMS, pageBannerSearchTerms } from "@/lib/unsplash-page-banner-terms";

describe("pageBannerSearchTerms", () => {
  it("uses collection, collector, and hobby for legal pages", () => {
    for (const path of ["/privacy", "/terms", "/sitemap"] as const) {
      expect(pageBannerSearchTerms(path)).toEqual(LEGAL_PAGE_BANNER_SEARCH_TERMS);
    }
  });
});
