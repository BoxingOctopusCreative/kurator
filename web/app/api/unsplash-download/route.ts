import { NextResponse } from "next/server";

import { triggerUnsplashPhotoDownload } from "@/lib/unsplash-cover-search.server";

export const dynamic = "force-dynamic";

type Body = { id?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "no_key" }, { status: 503 });
  }

  await triggerUnsplashPhotoDownload(id);
  return NextResponse.json({ ok: true });
}
