import type { Category, HitlistEntry } from "@/lib/api";
import { getCoverArtUrl } from "@/lib/itemDisplay";

function notesFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const n = metadata.notes;
  if (typeof n === "string") {
    const t = n.trim();
    return t === "" ? null : t;
  }
  return null;
}

/** Cover URL, title, and category for a hitlist row (item link or stub). */
export function hitlistEntryCoverAndTitle(entry: HitlistEntry): {
  cover: string | null;
  title: string;
  category: Category | null;
} {
  if (entry.item) {
    const meta =
      entry.item.metadata && typeof entry.item.metadata === "object" && !Array.isArray(entry.item.metadata)
        ? (entry.item.metadata as Record<string, unknown>)
        : {};
    return {
      cover: getCoverArtUrl(meta),
      title: entry.item.title,
      category: entry.item.category,
    };
  }
  if (entry.stub) {
    const meta =
      entry.stub.metadata && typeof entry.stub.metadata === "object" && !Array.isArray(entry.stub.metadata)
        ? (entry.stub.metadata as Record<string, unknown>)
        : {};
    return {
      cover: getCoverArtUrl(meta),
      title: entry.stub.title,
      category: entry.stub.category,
    };
  }
  return { cover: null, title: "Entry", category: null };
}

/**
 * Markdown text to show for a hitlist row: per-entry blurb if set, otherwise the linked item’s
 * or stub’s **`metadata.notes`** (e.g. Description from quick-add).
 */
export function hitlistEntryDisplayMarkdown(entry: HitlistEntry): string | null {
  const row = entry.description?.trim();
  if (row) return row;

  if (entry.item?.metadata && typeof entry.item.metadata === "object" && !Array.isArray(entry.item.metadata)) {
    const fromItem = notesFromMetadata(entry.item.metadata as Record<string, unknown>);
    if (fromItem) return fromItem;
  }

  if (entry.stub?.metadata) {
    const fromStub = notesFromMetadata(entry.stub.metadata);
    if (fromStub) return fromStub;
  }

  return null;
}
