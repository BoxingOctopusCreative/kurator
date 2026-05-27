/**
 * Opt-in for Cloudflare Turnstile on login/register/forgot-password. When false, site keys do not enable the widget.
 *
 * **Docker / production:** Prefer **`CLOUDFLARE_TURNSTILE_ENABLED`** and **`CLOUDFLARE_TURNSTILE_SITEKEY`** on the
 * Next container — read at runtime. **`NEXT_PUBLIC_*`** equivalents are inlined at **`next build`**; setting them only
 * at container start has no effect unless you also pass them as build-args.
 *
 * Truthy enabled: true, 1, yes (case-insensitive).
 */
export function isCloudflareTurnstileEnabled(): boolean {
  const raw =
    process.env.CLOUDFLARE_TURNSTILE_ENABLED?.trim() ||
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_ENABLED?.trim() ||
    "";
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower === "1" || lower === "true" || lower === "t" || lower === "yes" || lower === "y") {
    return true;
  }
  if (lower === "0" || lower === "false" || lower === "f" || lower === "no" || lower === "n") {
    return false;
  }
  return false;
}
