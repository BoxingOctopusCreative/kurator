/** IDs align with `react-social-icons` `network` keys where possible, plus `custom` for any HTTPS profile. */
/** Platforms in this set use URL-based icon detection (`networkFor`): no bundled SVG in `react-social-icons`. */
export const SOCIAL_ICON_USE_NETWORK_FOR_URL = new Set([
  "goodreads",
  "imdb",
  "discogs",
  "ehnw.ca",
]);

/** Official Hey.Cafe roundel (used where `react-social-icons` has no network key). */
export const HEY_CAFE_ICON_URL =
  "https://assets.heycafecdn.com/logos/svg/logo_round_transparent_purple.svg";

export type SocialPlatformOption = {
  id: string;
  name: string;
  placeholder: string;
};

export const SOCIAL_PLATFORM_OPTIONS: readonly SocialPlatformOption[] = [
  { id: "github", name: "GitHub", placeholder: "username or organization/repo" },
  { id: "instagram", name: "Instagram", placeholder: "username" },
  { id: "facebook", name: "Facebook", placeholder: "profile or page URL" },
  { id: "youtube", name: "YouTube", placeholder: "@handle, channel ID, or full channel URL" },
  { id: "twitch", name: "Twitch", placeholder: "username" },
  { id: "discord", name: "Discord", placeholder: "invite or server URL" },
  { id: "reddit", name: "Reddit", placeholder: "u/username or full profile URL" },
  { id: "spotify", name: "Spotify", placeholder: "artist/album/track URL" },
  { id: "soundcloud", name: "SoundCloud", placeholder: "username or profile URL" },
  { id: "tiktok", name: "TikTok", placeholder: "@handle or username" },
  { id: "threads", name: "Threads", placeholder: "username (without @)" },
  { id: "bsky.app", name: "Bluesky", placeholder: "handle (e.g. name.bsky.social) or profile URL" },
  { id: "mastodon", name: "Mastodon", placeholder: "Full profile URL (any instance)" },
  { id: "linktree", name: "Linktree", placeholder: "username" },
  { id: "patreon", name: "Patreon", placeholder: "creator name or full URL" },
  { id: "substack", name: "Substack", placeholder: "publication URL" },
  { id: "goodreads", name: "Goodreads", placeholder: "Path after goodreads.com (e.g. user/show/…) or full URL" },
  { id: "imdb", name: "IMDb", placeholder: "user/ur…, name/nm…, or full profile URL" },
  { id: "discogs", name: "Discogs", placeholder: "username or full profile URL" },
  { id: "hey.cafe", name: "Hey.Cafe", placeholder: "username (with or without @)" },
  { id: "ehnw.ca", name: "Eh!", placeholder: "username" },
  { id: "custom", name: "Other website", placeholder: "https://…" },
] as const;

export const ALLOWED_SOCIAL_PLATFORM_IDS = new Set(SOCIAL_PLATFORM_OPTIONS.map((o) => o.id));

const OPTION_BY_ID = new Map(SOCIAL_PLATFORM_OPTIONS.map((o) => [o.id, o]));

export function socialPlatformDisplayName(id: string): string {
  return OPTION_BY_ID.get(id)?.name ?? "Social link";
}

function trimHandle(s: string): string {
  return s.trim().replace(/^@+/, "");
}

/** If input is already an http(s) URL, return it normalized; otherwise build from platform + handle. */
export function buildSocialProfileUrl(platform: string, raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const p = platform.trim().toLowerCase();

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  const h = trimHandle(t);
  if (!h) return null;

  switch (p) {
    case "github":
      return `https://github.com/${encodeURI(h)}`;
    case "instagram":
      return `https://www.instagram.com/${encodeURI(h)}/`;
    case "facebook":
      return `https://www.facebook.com/${encodeURI(h)}`;
    case "youtube":
      if (h.startsWith("@")) return `https://www.youtube.com/${encodeURI(h)}`;
      if (/^UC[\w-]{10,}$/i.test(h)) return `https://www.youtube.com/channel/${encodeURI(h)}`;
      return `https://www.youtube.com/@${encodeURI(h.replace(/^@/, ""))}`;
    case "twitch":
      return `https://www.twitch.tv/${encodeURI(h)}`;
    case "discord":
      if (/^discord\.(gg|com)/i.test(h)) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://discord.gg/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "reddit":
      if (h.startsWith("u/") || h.startsWith("user/")) return `https://www.reddit.com/${encodeURI(h)}`;
      if (h.startsWith("r/")) return `https://www.reddit.com/${encodeURI(h)}`;
      return `https://www.reddit.com/user/${encodeURI(h)}`;
    case "spotify":
      if (h.includes("spotify.com")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://open.spotify.com/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "soundcloud":
      return `https://soundcloud.com/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "tiktok":
      return `https://www.tiktok.com/@${encodeURI(h.replace(/^@/, ""))}`;
    case "threads":
      return `https://www.threads.net/@${encodeURI(h.replace(/^@/, ""))}`;
    case "bsky.app": {
      if (h.includes("/")) return `https://bsky.app/${h.replace(/^\/*/, "")}`;
      const handle = h.includes(".") ? h : `${h}.bsky.social`;
      return `https://bsky.app/profile/${encodeURI(handle)}`;
    }
    case "mastodon":
      return null;
    case "linktree":
      return `https://linktr.ee/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "patreon":
      if (h.includes("patreon.com")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://www.patreon.com/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "substack":
      if (h.includes(".")) return `https://${h}`;
      return `https://${encodeURI(h)}.substack.com`;
    case "goodreads":
      if (h.includes("goodreads.com")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://www.goodreads.com/${h.replace(/^\/*/, "")}`;
    case "imdb":
      if (h.includes("imdb.com")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://www.imdb.com/${h.replace(/^\/*/, "")}`;
    case "discogs":
      if (h.includes("discogs.com")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://www.discogs.com/user/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "hey.cafe":
      if (h.includes("hey.cafe")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://hey.cafe/@${encodeURI(trimHandle(h))}`;
    case "ehnw.ca":
      if (h.includes("ehnw.ca")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://ehnw.ca/u/${encodeURI(trimHandle(h))}`;
    case "custom":
      return null;
    default:
      return null;
  }
}

/** Reverse URL → handle field for editing (best effort). */
export function extractHandleForEditing(platform: string, urlStr: string): string {
  try {
    const u = new URL(urlStr.trim());
    const path = u.pathname.replace(/\/+$/, "") || "/";
    switch (platform) {
      case "github":
        return path.replace(/^\//, "");
      case "instagram":
        return path.replace(/^\//, "").replace(/\/$/, "");
      case "facebook":
        return urlStr;
      case "youtube":
        return path.includes("/@") ? `@${path.split("/@")[1]?.split("/")[0] ?? ""}` : path.replace(/^\//, "");
      case "twitch":
        return path.replace(/^\//, "");
      case "discord":
      case "reddit":
      case "spotify":
      case "soundcloud":
      case "mastodon":
      case "goodreads":
      case "imdb":
        return urlStr;
      case "tiktok":
        return path.replace(/^\/@/, "@");
      case "threads":
        return path.replace(/^\/@/, "@");
      case "bsky.app":
        return path.includes("/profile/") ? (path.split("/profile/")[1] ?? "") : urlStr;
      case "linktree":
        return path.replace(/^\//, "");
      case "patreon":
        return path.replace(/^\//, "");
      case "discogs":
        if (path.startsWith("/user/")) return path.slice("/user/".length);
        return path.replace(/^\//, "") || urlStr;
      case "hey.cafe":
        return path.replace(/^\/@/, "").replace(/^\/*/, "") || urlStr;
      case "ehnw.ca":
        return path.replace(/^\/u\//, "").replace(/^\/*/, "") || urlStr;
      case "substack":
        return u.hostname.replace(/\.substack\.com$/i, "");
      case "custom":
        return urlStr;
      default:
        return urlStr;
    }
  } catch {
    return urlStr;
  }
}

export type SocialEditRow = { id: string; platform: string; handle: string };

function newSocialRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `social-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** New editable row for the profile social-links form (stable `id` for list keys / reorder). */
export function newSocialEditRow(partial?: Partial<Pick<SocialEditRow, "platform" | "handle">>): SocialEditRow {
  return {
    id: newSocialRowId(),
    platform: partial?.platform ?? "github",
    handle: partial?.handle ?? "",
  };
}

/** Maps API / persisted JSON to edit rows (supports legacy `{ label, url }`). */
export function parseSocialLinksToRows(raw: unknown): SocialEditRow[] {
  if (!Array.isArray(raw)) return [];
  const out: SocialEditRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) continue;
    let platform = typeof o.platform === "string" ? o.platform.trim().toLowerCase() : "";
    if (!platform || platform === "sharethis") {
      platform = inferPlatformFromUrl(url);
    }
    if (!ALLOWED_SOCIAL_PLATFORM_IDS.has(platform)) {
      platform = "custom";
    }
    out.push({
      id: newSocialRowId(),
      platform,
      handle: extractHandleForEditing(platform, url),
    });
  }
  return out;
}

function inferPlatformFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "github.com" || host.endsWith(".github.com") || host === "gist.github.com") return "github";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("facebook.com") || host === "fb.com" || host === "m.facebook.com") return "facebook";
    if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
    if (host.includes("twitch.tv")) return "twitch";
    if (host.includes("discord.")) return "discord";
    if (host.includes("reddit.com")) return "reddit";
    if (host.includes("spotify.com")) return "spotify";
    if (host.includes("soundcloud.com")) return "soundcloud";
    if (host.includes("tiktok.com")) return "tiktok";
    if (host === "threads.net") return "threads";
    if (host.includes("bsky.app")) return "bsky.app";
    if (host.includes("linktr.ee") || host.includes("linktree.com")) return "linktree";
    if (host.includes("patreon.com")) return "patreon";
    if (host.includes("substack.com")) return "substack";
    if (host === "hey.cafe") return "hey.cafe";
    if (host === "ehnw.ca") return "ehnw.ca";
    if (host.includes("goodreads.com")) return "goodreads";
    if (host.includes("imdb.com")) return "imdb";
    if (host.includes("discogs.com")) return "discogs";
    if (host.includes("mastodon") || u.pathname.includes("/@")) return "mastodon";
  } catch {
    /* ignore */
  }
  return "custom";
}

/** Builds `{ platform, url }[]` for PATCH /me. Drops empty rows. */
export function socialEditRowsToPayload(rows: SocialEditRow[]): { platform: string; url: string }[] {
  const out: { platform: string; url: string }[] = [];
  for (const row of rows) {
    const platform = row.platform.trim().toLowerCase();
    if (!platform) continue;
    const raw = row.handle.trim();
    if (!raw) continue;
    let url: string | null = null;
    if (platform === "custom") {
      const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      try {
        const u = new URL(candidate);
        if (u.protocol !== "http:" && u.protocol !== "https:") continue;
        url = u.toString();
      } catch {
        continue;
      }
    } else if (platform === "mastodon") {
      if (!/^https?:\/\//i.test(raw)) continue;
      try {
        const u = new URL(raw);
        if (u.protocol !== "http:" && u.protocol !== "https:") continue;
        url = u.toString();
      } catch {
        continue;
      }
    } else {
      url = buildSocialProfileUrl(platform, raw);
    }
    if (!url) continue;
    out.push({ platform, url });
  }
  return out;
}
