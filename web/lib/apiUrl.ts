/**
 * Resolves API URLs for server vs browser.
 *
 * In the browser, always use same-origin `/api/v1/...` or `/api/v2/...` so the App Router proxies
 * (`app/api/v1/[[...path]]/route.ts`, `app/api/v2/[[...path]]/route.ts`) forward to the API and
 * session cookies stay on the app origin. Pointing the browser at `NEXT_PUBLIC_API_URL` (e.g.
 * api.example.com) would be cross-origin and break cookie auth unless you redesign CORS and cookie
 * attributes.
 *
 * Server-side uses API_INTERNAL_URL or falls back to a direct backend URL.
 */

export type ApiVersion = "v1" | "v2";

export type ApiUrlOptions = {
  /** When `path` is relative (does not start with `/api/v1` or `/api/v2`), which API prefix to use. Default `v1`. */
  version?: ApiVersion;
};

export function apiUrl(path: string, options?: ApiUrlOptions): string {
  const hasExplicitPrefix = path.startsWith("/api/v1") || path.startsWith("/api/v2");
  const version: ApiVersion = options?.version ?? "v1";
  const prefix = `/api/${version}`;
  const normalized = hasExplicitPrefix
    ? path.startsWith("/")
      ? path
      : `/${path}`
    : `${prefix}${path.startsWith("/") ? path : `/${path}`}`;

  if (typeof window !== "undefined") {
    return normalized;
  }

  const internal =
    process.env.API_INTERNAL_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8080";
  return `${internal}${normalized}`;
}
