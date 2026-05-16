import type { HitlistEntry } from "@/lib/api";

/** How many hero mosaic cells we fill (cycles URLs when there are fewer unique covers than cells). */
export const HITLIST_HERO_COLLAGE_CELL_COUNT = 24;

/** At this many unique covers or fewer, hero uses a horizontal strip (one tile per cover). Above → 6×4 grid. */
export const HITLIST_HERO_COLLAGE_STRIP_MAX_UNIQUE = 6;

export type HitlistHeroCollageLayout = "strip" | "grid";

function trimHttpishUrl(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  return t ? t : null;
}

/**
 * Resolves cover image URL for a linked hitlist item.
 * API payloads omit a dedicated column — covers live on {@link Item.metadata} as `cover_art`
 * (same as {@link metadataToCategoryFormSlice} / item edit UI).
 */
export function coverArtUrlFromHitlistItem(item: HitlistEntry["item"]): string | null {
  if (!item) return null;
  const direct = trimHttpishUrl(item.cover_art_url ?? undefined);
  if (direct) return direct;
  const meta = item.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const c = (meta as Record<string, unknown>).cover_art;
    return trimHttpishUrl(typeof c === "string" ? c : undefined);
  }
  return null;
}

function coverArtUrlFromHitlistStub(stub: HitlistEntry["stub"]): string | null {
  if (!stub?.metadata || typeof stub.metadata !== "object" || Array.isArray(stub.metadata)) {
    return null;
  }
  const c = (stub.metadata as Record<string, unknown>).cover_art;
  return trimHttpishUrl(typeof c === "string" ? c : undefined);
}

/**
 * Strength of entry-cover collage vs the base hero image (0 = hidden, 1 = dominant).
 * Scales over ~10 distinct covers so the hero eases from banner → collage as the list grows.
 */
export function hitlistHeroCollageStrength(uniqueCoverCount: number): number {
  if (uniqueCoverCount <= 0) return 0;
  return Math.min(1, uniqueCoverCount / 10);
}

/** Ordered unique cover URLs from hitlist entries (item links and stubs). */
export function collectHitlistEntryCoverUrls(entries: HitlistEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    const url = coverArtUrlFromHitlistItem(e.item) ?? coverArtUrlFromHitlistStub(e.stub);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function hitlistHeroCollageLayout(uniqueCount: number): HitlistHeroCollageLayout | null {
  if (uniqueCount <= 0) return null;
  return uniqueCount <= HITLIST_HERO_COLLAGE_STRIP_MAX_UNIQUE ? "strip" : "grid";
}

/** URLs and layout for the hero collage layer (strip = side-by-side, no duplication). */
export function hitlistHeroCollageDisplay(uniqueUrls: string[]): {
  layout: HitlistHeroCollageLayout;
  urls: string[];
} | null {
  if (uniqueUrls.length === 0) return null;
  const layout = hitlistHeroCollageLayout(uniqueUrls.length);
  if (!layout) return null;
  if (layout === "strip") {
    return { layout: "strip", urls: uniqueUrls };
  }
  return { layout: "grid", urls: hitlistHeroCollageCellUrls(uniqueUrls) };
}

/** Cycle URLs across mosaic cells for a dense collage. */
export function hitlistHeroCollageCellUrls(uniqueUrls: string[], cellCount = HITLIST_HERO_COLLAGE_CELL_COUNT): string[] {
  if (uniqueUrls.length === 0) return [];
  return Array.from({ length: cellCount }, (_, i) => uniqueUrls[i % uniqueUrls.length]);
}
