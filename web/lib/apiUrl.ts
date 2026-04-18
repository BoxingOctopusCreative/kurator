/**
 * Resolves API URLs for server vs browser. When NEXT_PUBLIC_API_URL is unset,
 * the browser uses same-origin `/api/v1/...` (see next.config rewrites) so session cookies work.
 * Server-side uses API_INTERNAL_URL or falls back to a direct backend URL.
 */
export function apiUrl(path: string): string {
  const normalized =
    path.startsWith("/api/v1") ? path : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;

  if (typeof window !== "undefined") {
    const pub = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!pub) return normalized;
    return `${pub}${normalized}`;
  }

  const internal =
    process.env.API_INTERNAL_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8080";
  return `${internal}${normalized}`;
}
