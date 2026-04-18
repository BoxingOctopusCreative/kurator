import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";

const KEY = "kurator-unsplash-bg-v1";
/** How long to reuse a cached background for instant paint (session tab only). */
const TTL_MS = 20 * 60 * 1000;

/** Survives tab close; used when Unsplash/API fetch fails so we can show the last good image. */
const LAST_SUCCESS_KEY = "kurator-unsplash-bg-last-v1";

export function readUnsplashBackgroundCache(): UnsplashBackgroundPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; payload: UnsplashBackgroundPayload };
    if (Date.now() - parsed.t > TTL_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed.payload?.url ? parsed.payload : null;
  } catch {
    return null;
  }
}

export function writeUnsplashBackgroundCache(payload: UnsplashBackgroundPayload) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), payload }));
  } catch {
    /* storage full */
  }
}

export function readUnsplashBackgroundLastSuccess(): UnsplashBackgroundPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_SUCCESS_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as UnsplashBackgroundPayload;
    return payload?.url ? payload : null;
  } catch {
    return null;
  }
}

export function writeUnsplashBackgroundLastSuccess(payload: UnsplashBackgroundPayload) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_SUCCESS_KEY, JSON.stringify(payload));
  } catch {
    /* storage full / private mode */
  }
}
