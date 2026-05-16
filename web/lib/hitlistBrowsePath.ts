import type { Visibility } from "@/lib/api";

export type HitlistBrowseInput = {
  id: string;
  slug?: string | null;
  visibility?: Visibility;
  /**
   * When true (e.g. signed-in viewer), always use `/lists/:id` instead of the public permalink.
   */
  preferAppView?: boolean;
};

/**
 * Prefer `/hitlists/:slug` for internet-public hitlists that have a slug; otherwise `/lists/:id`.
 * Signed-in browsing surfaces pass `preferAppView: true` so the app shell is the default.
 */
export function hitlistBrowsePath(input: HitlistBrowseInput): string {
  if (input.preferAppView) {
    return `/lists/${input.id}`;
  }
  const vis = input.visibility ?? "private";
  const slug = input.slug?.trim();
  if (vis === "public" && slug) {
    return `/hitlists/${encodeURIComponent(slug)}`;
  }
  return `/lists/${input.id}`;
}
