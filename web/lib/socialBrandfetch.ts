/**
 * Brandfetch Logo CDN — browser hotlink URLs (see https://docs.brandfetch.com/get-started).
 * Set NEXT_PUBLIC_BRANDFETCH_CLIENT_ID to your Brandfetch Client ID.
 */

/** Map Kurator social `platform` → brand domain for the Logo CDN. */
const PLATFORM_BRAND_DOMAIN: Record<string, string> = {
  github: "github.com",
  instagram: "instagram.com",
  facebook: "facebook.com",
  youtube: "youtube.com",
  twitch: "twitch.tv",
  discord: "discord.com",
  reddit: "reddit.com",
  spotify: "spotify.com",
  soundcloud: "soundcloud.com",
  tiktok: "tiktok.com",
  threads: "threads.net",
  "bsky.app": "bsky.app",
  /** Project mark for any fediverse profile URL (instance varies; icon is consistent). */
  mastodon: "joinmastodon.org",
  linktree: "linktr.ee",
  patreon: "patreon.com",
  substack: "substack.com",
  goodreads: "goodreads.com",
  imdb: "imdb.com",
  discogs: "discogs.com",
  "hey.cafe": "hey.cafe",
  "ehnw.ca": "ehnw.ca",
};

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function isLikelyBrandDomain(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
}

/** Domain for Brandfetch Logo CDN, or null to keep `react-social-icons` / native fallbacks. */
export function brandDomainForSocialPlatform(platform: string | undefined, profileUrl: string): string | null {
  const raw = profileUrl.trim();
  const p = (platform ?? "").trim().toLowerCase();

  if (p === "custom" || !p) {
    if (!raw || !/^https?:\/\//i.test(raw)) return null;
    try {
      const host = normalizeHost(new URL(raw).hostname);
      return isLikelyBrandDomain(host) ? host : null;
    } catch {
      return null;
    }
  }

  const mapped = PLATFORM_BRAND_DOMAIN[p];
  if (mapped) {
    // Trusted map — avoids rejecting valid CDN domains via hostname regex quirks.
    return normalizeHost(mapped);
  }

  return null;
}

export type BrandfetchLogoCdnOpts = {
  width: number;
  theme: "light" | "dark";
};

/**
 * Embed-safe Logo CDN URL (direct &lt;img src&gt; in the browser — not for server-side fetch).
 */
export function brandfetchLogoCdnUrl(domain: string, clientId: string, opts: BrandfetchLogoCdnOpts): string {
  const d = normalizeHost(domain);
  const cid = clientId.trim();
  const fallback = "lettermark";
  return `https://cdn.brandfetch.io/${d}/w/${opts.width}/theme/${opts.theme}/fallback/${fallback}?c=${encodeURIComponent(cid)}`;
}
