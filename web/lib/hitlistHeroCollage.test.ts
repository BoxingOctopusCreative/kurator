import { describe, expect, it } from "vitest";
import {
  collectHitlistEntryCoverUrls,
  hitlistHeroCollageCellUrls,
  hitlistHeroCollageDisplay,
  hitlistHeroCollageLayout,
  hitlistHeroCollageStrength,
  HITLIST_HERO_COLLAGE_CELL_COUNT,
  HITLIST_HERO_COLLAGE_STRIP_MAX_UNIQUE,
} from "@/lib/hitlistHeroCollage";
import type { HitlistEntry } from "@/lib/api";

describe("hitlistHeroCollageStrength", () => {
  it("is 0 when there are no covers", () => {
    expect(hitlistHeroCollageStrength(0)).toBe(0);
  });
  it("ramps toward 1 by cover count", () => {
    expect(hitlistHeroCollageStrength(1)).toBeCloseTo(0.1);
    expect(hitlistHeroCollageStrength(5)).toBeCloseTo(0.5);
    expect(hitlistHeroCollageStrength(10)).toBe(1);
    expect(hitlistHeroCollageStrength(99)).toBe(1);
  });
});

describe("collectHitlistEntryCoverUrls", () => {
  it("collects unique URLs in entry order", () => {
    const entries = [
      { item: { cover_art_url: " https://a/x " } },
      { item: { cover_art_url: "https://b/y" } },
      { item: { cover_art_url: "https://a/x" } },
      { item: null },
    ] as unknown as HitlistEntry[];
    expect(collectHitlistEntryCoverUrls(entries)).toEqual(["https://a/x", "https://b/y"]);
  });

  it("reads cover_art from item metadata when cover_art_url is absent", () => {
    const entries = [
      {
        item: {
          metadata: { cover_art: " https://cover/from/meta " },
        },
      },
      {
        item: {
          metadata: { cover_art: "https://other/cover" },
        },
      },
    ] as unknown as HitlistEntry[];
    expect(collectHitlistEntryCoverUrls(entries)).toEqual([
      "https://cover/from/meta",
      "https://other/cover",
    ]);
  });

  it("reads cover_art from stub metadata", () => {
    const entries = [
      {
        stub: {
          title: "t",
          category: "book",
          metadata: { cover_art: " https://stub/cover " },
        },
      },
    ] as unknown as HitlistEntry[];
    expect(collectHitlistEntryCoverUrls(entries)).toEqual(["https://stub/cover"]);
  });
});

describe("hitlistHeroCollageLayout", () => {
  it("uses strip for few unique covers", () => {
    expect(hitlistHeroCollageLayout(1)).toBe("strip");
    expect(hitlistHeroCollageLayout(HITLIST_HERO_COLLAGE_STRIP_MAX_UNIQUE)).toBe("strip");
  });
  it("uses grid above the strip threshold", () => {
    expect(hitlistHeroCollageLayout(HITLIST_HERO_COLLAGE_STRIP_MAX_UNIQUE + 1)).toBe("grid");
  });
});

describe("hitlistHeroCollageDisplay", () => {
  it("returns strip urls without duplication", () => {
    expect(hitlistHeroCollageDisplay(["a", "b"])).toEqual({
      layout: "strip",
      urls: ["a", "b"],
    });
  });
  it("returns cycled grid urls when many covers", () => {
    const urls = Array.from({ length: 8 }, (_, i) => `u${i}`);
    const d = hitlistHeroCollageDisplay(urls);
    expect(d?.layout).toBe("grid");
    expect(d?.urls).toHaveLength(HITLIST_HERO_COLLAGE_CELL_COUNT);
  });
});

describe("hitlistHeroCollageCellUrls", () => {
  it("cycles URLs to fill cells", () => {
    expect(hitlistHeroCollageCellUrls(["a", "b"], 4)).toEqual(["a", "b", "a", "b"]);
  });
  it("defaults to HITLIST_HERO_COLLAGE_CELL_COUNT", () => {
    expect(hitlistHeroCollageCellUrls(["x"]).length).toBe(HITLIST_HERO_COLLAGE_CELL_COUNT);
  });
});
