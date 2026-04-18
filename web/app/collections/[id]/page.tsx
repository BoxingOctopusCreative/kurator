import { cookies } from "next/headers";
import type { Metadata } from "next";
import { apiUrl } from "@/lib/apiUrl";
import { CollectionDetailClient } from "./CollectionDetailClient";

const SESSION_COOKIE = "kurator_session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId < 1) {
    return { title: "Collection" };
  }

  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!session) {
    return { title: "Collection" };
  }

  try {
    const res = await fetch(apiUrl(`/collections/${numericId}`), {
      headers: { Cookie: `${SESSION_COOKIE}=${session}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { title: "Collection" };
    }
    const col = (await res.json()) as { name?: string };
    const name = typeof col.name === "string" && col.name.trim() ? col.name.trim() : "Collection";
    return { title: name };
  } catch {
    return { title: "Collection" };
  }
}

export default function CollectionDetailPage() {
  return <CollectionDetailClient />;
}
