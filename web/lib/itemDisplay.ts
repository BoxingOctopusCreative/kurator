import type { Category, Item } from "@/lib/api";
import { categoryLabel } from "@/lib/categoryLabels";

const MUSIC_FORMAT_LABELS: Record<string, string> = {
  vinyl: "Vinyl",
  cd: "CD",
  tape: "Tape",
  other: "Other",
};

const VIDEO_FORMAT_LABELS: Record<string, string> = {
  vhs: "VHS",
  dvd: "DVD",
  blu_ray: "Blu-ray",
};

/** TV-only: box set / season line from metadata; empty when unset or not TV. */
export function getTvEditionSummary(item: Item): string {
  if (item.category !== "tv") return "";
  const meta = item.metadata;
  if (!meta || typeof meta !== "object") return "";
  const m = meta as Record<string, unknown>;
  const ed = m.tv_edition;
  if (typeof ed !== "string") return "";
  const t = ed.trim();
  if (t === "box_set") return "Box set";
  if (t !== "single_season") return "";
  const sn = m.tv_season;
  let n: number | null = null;
  if (typeof sn === "number" && Number.isFinite(sn)) {
    n = Math.trunc(sn);
  } else if (typeof sn === "string" && /^\d+$/.test(sn.trim())) {
    n = parseInt(sn.trim(), 10);
  }
  if (n === null || n < 1 || n > 999) return "Single season";
  return `Season ${n}`;
}

/** Physical format plus TV set type when relevant (shelf / table views). */
export function getItemFormatColumnLabel(item: Item): string {
  const parts = [getItemFormatLabel(item), getTvEditionSummary(item)].filter(Boolean);
  return parts.join(" · ");
}

/** User-visible format from metadata (music / video categories); empty when unset. */
export function getItemFormatLabel(item: Item): string {
  const meta = item.metadata;
  if (!meta || typeof meta !== "object") return "";
  const raw = (meta as Record<string, unknown>).format;
  if (typeof raw !== "string") return "";
  const t = raw.trim();
  if (!t) return "";
  const cat = item.category;
  if (cat === "music") {
    return MUSIC_FORMAT_LABELS[t] ?? t;
  }
  if (cat === "movies" || cat === "tv" || cat === "anime") {
    return VIDEO_FORMAT_LABELS[t] ?? t.replace(/_/g, " ");
  }
  return t;
}

/** Returns cover image URL from item metadata when present. */
export function getCoverArtUrl(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const c = metadata.cover_art;
  if (typeof c !== "string") return null;
  const t = c.trim();
  if (t === "") return null;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  return null;
}

export function getItemYear(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "";
  const y = metadata.year;
  if (typeof y === "number" && y >= 1000 && y <= 9999) return String(y);
  if (typeof y === "string" && /^\d{4}$/.test(y.trim())) return y.trim();
  return "";
}

/** Case-insensitive match on title, category label, and stringified metadata. */
export function itemMatchesSearch(item: Item, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (item.title.toLowerCase().includes(q)) return true;
  if (categoryLabel(item.category).toLowerCase().includes(q)) return true;
  try {
    const blob = JSON.stringify(item.metadata ?? {}).toLowerCase();
    return blob.includes(q);
  } catch {
    return false;
  }
}
