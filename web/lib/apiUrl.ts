/**
 * Resolves API URLs for server vs browser.
 *
 * In the browser, always use same-origin `/api/v1/...` so the App Router proxy
 * (`app/api/v1/[[...path]]/route.ts`) forwards to the API and session cookies stay on the app
 * origin. Pointing the browser at `NEXT_PUBLIC_API_URL` (e.g. api.example.com) would be
 * cross-origin and break cookie auth unless you redesign CORS and cookie attributes.
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
