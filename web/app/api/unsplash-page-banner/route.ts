import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { fetchUnsplashPageBanner } from "@/lib/unsplash-page-banner.server";

const CACHE_CONTROL_OK = "private, max-age=3600, stale-while-revalidate=120";

function sanitizePath(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/";
  let t = raw.trim();
  if (!t.startsWith("/")) t = `/${t}`;
  if (t.length > 512) t = t.slice(0, 512);
  return t || "/";
}

export async function GET(req: Request) {
  const path = sanitizePath(new URL(req.url).searchParams.get("path"));

  const getCachedBanner = unstable_cache(
    async () => fetchUnsplashPageBanner(),
    ["unsplash-page-banner", path],
    { revalidate: 3600 },
  );

  const payload = await getCachedBanner();
  if (payload?.url) {
    return NextResponse.json(payload, {
      headers: { "Cache-Control": CACHE_CONTROL_OK },
    });
  }
  return NextResponse.json(null, {
    status: 204,
    headers: { "Cache-Control": "private, max-age=120" },
  });
}
