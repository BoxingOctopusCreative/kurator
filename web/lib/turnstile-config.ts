/**
 * Opt-in for Cloudflare Turnstile on login/register. When false, site keys do not enable the widget.
 * Server: set CLOUDFLARE_TURNSTILE_ENABLED. Client bundles: NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_ENABLED.
 * Truthy: true, 1, yes (case-insensitive).
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
