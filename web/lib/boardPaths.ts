/** Canonical web paths for boards (slug-based permalinks). */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBoardUuid(ref: string): boolean {
  return UUID_RE.test(ref.trim());
}

export function boardPath(slug: string): string {
  return `/boards/${encodeURIComponent(slug.trim())}`;
}

export function boardThreadPath(slug: string, threadId: string): string {
  return `${boardPath(slug)}/threads/${encodeURIComponent(threadId)}`;
}
