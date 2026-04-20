/**
 * Returns `raw` if it parses as an absolute `http:` or `https:` URL, otherwise `null`.
 * Use for `href`, `src`, and `next/image` `src` when the string comes from an API or cache.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * For `<img src>` (and similar): absolute `http:`/`https:` URLs, or a single leading-slash path
 * (same-origin asset). Rejects `javascript:`, `data:`, protocol-relative `//`, etc.
 */
export function safeImageSrcUrl(raw: string | null | undefined): string | null {
  const abs = safeHttpUrl(raw);
  if (abs) return abs;
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  return null;
}
