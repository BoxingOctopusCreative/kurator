import { NextResponse } from "next/server";

import { searchUnsplashCovers } from "@/lib/unsplash-cover-search.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const pageRaw = searchParams.get("page");
  const page = pageRaw == null || pageRaw === "" ? undefined : Number(pageRaw);

  const result = await searchUnsplashCovers(q, page);
  if (!result.ok) {
    if (result.code === "no_key") {
      return NextResponse.json(
        { error: "no_key", message: "Set UNSPLASH_ACCESS_KEY to enable Unsplash search." },
        { status: 503 },
      );
    }
    if (result.code === "bad_request") {
      return NextResponse.json({ error: "bad_request", message: result.message ?? "Invalid query." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "upstream", message: result.message ?? "Search failed." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    photos: result.photos,
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
  });
}
