import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";

const PREFIX = "kurator-page-hero-v2:";
/** Align with server `revalidate` for `/api/unsplash-page-banner`. */
export const PAGE_HERO_CACHE_TTL_MS = 60 * 60 * 1000;

type Cached = { t: number; payload: UnsplashBackgroundPayload };

export function readPageHeroBannerCache(pathname: string): UnsplashBackgroundPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIX + pathname);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed?.payload?.url || typeof parsed.t !== "number") return null;
    if (Date.now() - parsed.t > PAGE_HERO_CACHE_TTL_MS) {
      localStorage.removeItem(PREFIX + pathname);
      return null;
    }
    return parsed.payload;
  } catch {
    return null;
  }
}

export function writePageHeroBannerCache(pathname: string, payload: UnsplashBackgroundPayload): void {
  if (typeof window === "undefined") return;
  try {
    const entry: Cached = { t: Date.now(), payload };
    localStorage.setItem(PREFIX + pathname, JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}
