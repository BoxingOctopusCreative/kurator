import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";

/** Curated queries; one is chosen at random, then a random result from that search page. */
const SEARCH_TERMS = [
  "collection books",
  "collection games",
  "collection music",
  "collection movies",
  "collection video",
  "collection comics",
  "collection manga",
  "collection shelf",
  "vinyl collection",
  "collector display",
  "board game collection",
  "movie collection shelf",
];

type UnsplashPhoto = {
  urls?: { regular?: string; full?: string };
  user?: { name?: string; links?: { html?: string } };
  links?: { html?: string };
};

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function shuffleCopy<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function unsplashHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Client-ID ${key}`,
    "Accept-Version": "v1",
    "User-Agent": "Kurator/1.0 (https://kuratorapp.cc)",
  };
}

/** Auth or permission failure — retrying other endpoints will not help. */
function isUnsplashAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * Fetches a random Unsplash background image (same logic as GET /api/unsplash-background).
 * Returns null if UNSPLASH_ACCESS_KEY is missing or Unsplash returns an error.
 */
export async function fetchUnsplashBackground(): Promise<UnsplashBackgroundPayload | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    return null;
  }

  const headers = unsplashHeaders(key);

  for (const query of shuffleCopy(SEARCH_TERMS)) {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "30");
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");

    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    if (!res.ok) {
      if (isUnsplashAuthError(res.status)) {
        return null;
      }
      continue;
    }

    let data: { results?: UnsplashPhoto[] };
    try {
      data = (await res.json()) as { results?: UnsplashPhoto[] };
    } catch {
      continue;
    }
    const results = data.results ?? [];
    if (results.length === 0) {
      continue;
    }

    const photo = pickRandom(results);
    const imageUrl = photo.urls?.regular ?? photo.urls?.full;
    if (!imageUrl) {
      continue;
    }

    return {
      url: imageUrl,
      photographer: photo.user?.name ?? "Photographer",
      photographerUrl: photo.user?.links?.html,
      photoPageUrl: photo.links?.html,
      query,
    };
  }

  const query = pickRandom(SEARCH_TERMS);
  const randomUrl = new URL("https://api.unsplash.com/photos/random");
  randomUrl.searchParams.set("query", query);
  randomUrl.searchParams.set("orientation", "landscape");
  randomUrl.searchParams.set("content_filter", "high");

  const res = await fetch(randomUrl.toString(), { headers, cache: "no-store" });
  if (!res.ok) {
    return null;
  }

  let photo: UnsplashPhoto;
  try {
    photo = (await res.json()) as UnsplashPhoto;
  } catch {
    return null;
  }
  const imageUrl = photo.urls?.regular ?? photo.urls?.full;
  if (!imageUrl) {
    return null;
  }

  return {
    url: imageUrl,
    photographer: photo.user?.name ?? "Photographer",
    photographerUrl: photo.user?.links?.html,
    photoPageUrl: photo.links?.html,
    query,
  };
}
