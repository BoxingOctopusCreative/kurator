import { cookies } from "next/headers";
import type { Metadata } from "next";
import { apiUrl } from "@/lib/apiUrl";
import { ItemDetailClient } from "./ItemDetailClient";

const SESSION_COOKIE = "kurator_session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId < 1) {
    return { title: "Item" };
  }

  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!session) {
    return { title: "Item" };
  }

  try {
    const res = await fetch(apiUrl(`/items/${numericId}`), {
      headers: { Cookie: `${SESSION_COOKIE}=${session}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { title: "Item" };
    }
    const it = (await res.json()) as { title?: string };
    const title = typeof it.title === "string" && it.title.trim() ? it.title.trim() : "Item";
    return { title };
  } catch {
    return { title: "Item" };
  }
}

export default function ItemDetailPage() {
  return <ItemDetailClient />;
}
