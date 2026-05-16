import type { Category, HitlistEntry, Item } from "@/lib/api";

export type HitlistEntryCopyPayload = {
  title: string;
  category: Category;
  metadata: Record<string, unknown>;
  /** Present when copying from a catalog item (rating / consumption optional). */
  sourceItem?: Item;
};

function cloneRecord(m: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(m ?? {})) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Build a payload to create a new item or wishlist entry from a hitlist row (linked item or stub). */
export function hitlistEntryCopyPayload(entry: HitlistEntry): HitlistEntryCopyPayload | null {
  if (entry.item) {
    const it = entry.item;
    return {
      title: it.title,
      category: it.category,
      metadata: cloneRecord(it.metadata),
      sourceItem: it,
    };
  }
  if (entry.stub) {
    return {
      title: entry.stub.title,
      category: entry.stub.category,
      metadata: cloneRecord(entry.stub.metadata),
    };
  }
  return null;
}
