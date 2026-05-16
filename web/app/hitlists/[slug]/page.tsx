import type { Metadata } from "next";
import { fetchHitlistBySlug } from "@/lib/api";
import { HitlistSlugClient } from "./HitlistSlugClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dec = decodeURIComponent(slug.trim());
  try {
    const hit = await fetchHitlistBySlug(dec, { credentials: "omit" });
    if (!hit) return { title: "Hitlist" };
    return {
      title: `${hit.name} · Hitlist`,
      description: (hit.description && hit.description.trim().slice(0, 160)) || `Hitlist on Kurator: ${hit.name}`,
    };
  } catch {
    return { title: "Hitlist" };
  }
}

export default async function HitlistBySlugPage() {
  return <HitlistSlugClient />;
}
