/**
 * Resolves API URLs for server vs browser.
 *
 * In the browser, always use same-origin `/api/v1/...` so Next.js rewrites proxy to the API
 * and session cookies stay on the app origin. Sending `NEXT_PUBLIC_API_URL` here used to
 * bypass the rewrite and break auth (see metadata lookup comment in api.ts).
 *
 * Server-side uses API_INTERNAL_URL or falls back to a direct backend URL.
 */
export function apiUrl(path: string): string {
  const normalized =
    path.startsWith("/api/v1") ? path : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;

  if (typeof window !== "undefined") {
    return normalized;
  }

  const internal =
    process.env.API_INTERNAL_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8080";
  return `${internal}${normalized}`;
}
