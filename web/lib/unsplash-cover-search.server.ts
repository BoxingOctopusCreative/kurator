import { unsplashHeaders } from "@/lib/unsplash-background.server";
import type { UnsplashCoverSearchHit } from "@/lib/unsplash-cover-search.types";

type UnsplashPhoto = {
  id?: string;
  urls?: { thumb?: string; small?: string; regular?: string };
  user?: { name?: string; links?: { html?: string } };
  links?: { html?: string };
};

const MAX_QUERY_LEN = 200;

function withUtm(href: string | undefined, source: "photographer" | "photo"): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href);
    u.searchParams.set("utm_source", "kurator");
    u.searchParams.set("utm_medium", "referral");
    if (source === "photographer") {
      u.searchParams.set("utm_content", "photographer");
    } else {
      u.searchParams.set("utm_content", "photo");
    }
    return u.toString();
  } catch {
    return href;
  }
}

const MAX_PAGE = 1000;

function clampPage(n: unknown): number {
  const raw = n == null ? 1 : Number(n);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(MAX_PAGE, Math.max(1, Math.floor(raw)));
}

export async function searchUnsplashCovers(
  rawQuery: string,
  pageInput?: number,
): Promise<
  | { ok: true; photos: UnsplashCoverSearchHit[]; page: number; totalPages: number; total: number }
  | { ok: false; code: "no_key" | "bad_request" | "upstream"; message?: string }
> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    return { ok: false, code: "no_key" };
  }

  const q = rawQuery.trim();
  if (!q || q.length > MAX_QUERY_LEN) {
    return { ok: false, code: "bad_request", message: "Enter a search between 1 and 200 characters." };
  }

  const page = clampPage(pageInput);

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", "12");
  url.searchParams.set("orientation", "squarish");
  url.searchParams.set("content_filter", "high");

  const res = await fetch(url.toString(), { headers: unsplashHeaders(key), cache: "no-store" });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, code: "upstream", message: "Unsplash rejected the request (check the access key)." };
    }
    return { ok: false, code: "upstream", message: "Unsplash search failed." };
  }

  let data: { results?: UnsplashPhoto[]; total?: number; total_pages?: number };
  try {
    data = (await res.json()) as { results?: UnsplashPhoto[]; total?: number; total_pages?: number };
  } catch {
    return { ok: false, code: "upstream", message: "Invalid response from Unsplash." };
  }

  const total =
    typeof data.total === "number" && Number.isFinite(data.total) && data.total >= 0 ? Math.floor(data.total) : 0;
  const totalPagesRaw =
    typeof data.total_pages === "number" && Number.isFinite(data.total_pages)
      ? Math.floor(data.total_pages)
      : undefined;
  const totalPages = Math.min(MAX_PAGE, Math.max(1, totalPagesRaw ?? (total > 0 ? 1 : 1)));

  const results = data.results ?? [];
  const photos: UnsplashCoverSearchHit[] = [];
  for (const photo of results) {
    const id = typeof photo.id === "string" ? photo.id : "";
    const thumbUrl = photo.urls?.thumb ?? photo.urls?.small;
    const importUrl = photo.urls?.small ?? photo.urls?.regular ?? photo.urls?.thumb;
    if (!id || !thumbUrl || !importUrl) continue;
    photos.push({
      id,
      thumbUrl,
      importUrl,
      photographer: photo.user?.name?.trim() || "Photographer",
      photographerUrl: withUtm(photo.user?.links?.html, "photographer"),
      photoPageUrl: withUtm(photo.links?.html, "photo"),
    });
  }

  return { ok: true, photos, page, totalPages, total };
}

/** Notify Unsplash when a user selects a photo (e.g. for cover art). Best-effort; ignores errors. */
export async function triggerUnsplashPhotoDownload(photoId: string): Promise<void> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return;
  const id = photoId.trim();
  if (!id || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) return;
  await fetch(`https://api.unsplash.com/photos/${encodeURIComponent(id)}/download`, {
    headers: unsplashHeaders(key),
    cache: "no-store",
  }).catch(() => {});
}
