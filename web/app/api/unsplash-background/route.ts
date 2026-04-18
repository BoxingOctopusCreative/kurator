import { NextResponse } from "next/server";

import { fetchUnsplashBackground } from "@/lib/unsplash-background.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await fetchUnsplashBackground();
  if (!payload) {
    const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
    if (!key) {
      return NextResponse.json(
        { error: "no_key", message: "Set UNSPLASH_ACCESS_KEY." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "unsplash", message: "Could not load image." }, { status: 502 });
  }

  return NextResponse.json(payload);
}
