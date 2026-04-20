/** IDs align with `react-social-icons` `network` keys where possible, plus `custom` for any HTTPS profile. */

export type SocialPlatformOption = {
  id: string;
  name: string;
  placeholder: string;
};

export const SOCIAL_PLATFORM_OPTIONS: readonly SocialPlatformOption[] = [
  { id: "github", name: "GitHub", placeholder: "username or organization/repo" },
  { id: "gitlab", name: "GitLab", placeholder: "username" },
  { id: "linkedin", name: "LinkedIn", placeholder: "in/your-handle or full profile URL" },
  { id: "x", name: "X (Twitter)", placeholder: "username (without @)" },
  { id: "instagram", name: "Instagram", placeholder: "username" },
  { id: "facebook", name: "Facebook", placeholder: "profile or page URL" },
  { id: "youtube", name: "YouTube", placeholder: "@handle, channel ID, or full channel URL" },
  { id: "twitch", name: "Twitch", placeholder: "username" },
  { id: "discord", name: "Discord", placeholder: "invite or server URL" },
  { id: "reddit", name: "Reddit", placeholder: "u/username or full profile URL" },
  { id: "medium", name: "Medium", placeholder: "@handle or profile URL" },
  { id: "spotify", name: "Spotify", placeholder: "artist/album/track URL" },
  { id: "soundcloud", name: "SoundCloud", placeholder: "username or profile URL" },
  { id: "tiktok", name: "TikTok", placeholder: "@handle or username" },
  { id: "pinterest", name: "Pinterest", placeholder: "username" },
  { id: "dribbble", name: "Dribbble", placeholder: "username" },
  { id: "figma", name: "Figma", placeholder: "username or file URL" },
  { id: "threads", name: "Threads", placeholder: "username (without @)" },
  { id: "bsky.app", name: "Bluesky", placeholder: "handle (e.g. name.bsky.social) or profile URL" },
  { id: "mastodon", name: "Mastodon", placeholder: "Full profile URL (any instance)" },
  { id: "linktree", name: "Linktree", placeholder: "username" },
  { id: "patreon", name: "Patreon", placeholder: "creator name or full URL" },
  { id: "vimeo", name: "Vimeo", placeholder: "username or video/channel URL" },
  { id: "dev.to", name: "DEV Community", placeholder: "username" },
  { id: "stackoverflow", name: "Stack Overflow", placeholder: "users/id/name or full profile URL" },
  { id: "slack", name: "Slack", placeholder: "Workspace or invite URL" },
  { id: "substack", name: "Substack", placeholder: "publication URL" },
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
    case "gitlab":
      return `https://gitlab.com/${encodeURI(h)}`;
    case "linkedin":
      if (h.includes("/")) return `https://www.linkedin.com/${h.replace(/^\/*/, "")}`;
      return `https://www.linkedin.com/in/${encodeURI(h)}`;
    case "x":
      return `https://x.com/${encodeURI(h)}`;
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
    case "medium":
      if (h.startsWith("@")) return `https://medium.com/${encodeURI(h)}`;
      return `https://medium.com/@${encodeURI(h)}`;
    case "spotify":
      if (h.includes("spotify.com")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://open.spotify.com/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "soundcloud":
      return `https://soundcloud.com/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "tiktok":
      return `https://www.tiktok.com/@${encodeURI(h.replace(/^@/, ""))}`;
    case "pinterest":
      return `https://www.pinterest.com/${encodeURI(h.replace(/^\/*/, ""))}/`;
    case "dribbble":
      return `https://dribbble.com/${encodeURI(h)}`;
    case "figma":
      if (h.includes("/")) return `https://www.figma.com/${h.replace(/^\/*/, "")}`;
      return `https://www.figma.com/@${encodeURI(h)}`;
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
    case "vimeo":
      if (h.includes("vimeo.com")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://vimeo.com/${encodeURI(h)}`;
    case "dev.to":
      return `https://dev.to/${encodeURI(h)}`;
    case "stackoverflow":
      if (h.includes("stackoverflow.com") || h.includes("stackexchange.com")) {
        return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      }
      return `https://stackoverflow.com/users/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "slack":
      if (h.includes("slack")) return `https://${h.replace(/^https?:\/\//i, "").replace(/^\/+/, "")}`;
      return `https://slack.com/${encodeURI(h.replace(/^\/*/, ""))}`;
    case "substack":
      if (h.includes(".")) return `https://${h}`;
      return `https://${encodeURI(h)}.substack.com`;
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
      case "gitlab":
        return path.replace(/^\//, "").split("/")[0] ?? "";
      case "linkedin":
        return path.replace(/^\//, "") || urlStr;
      case "x":
        return path.replace(/^\//, "").replace(/^@/, "");
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
      case "medium":
      case "spotify":
      case "soundcloud":
      case "mastodon":
      case "slack":
      case "stackoverflow":
        return urlStr;
      case "tiktok":
        return path.replace(/^\/@/, "@");
      case "pinterest":
        return path.replace(/^\//, "").replace(/\/$/, "");
      case "dribbble":
        return path.replace(/^\/+/, "");
      case "figma":
        return path.replace(/^\/+/, "");
      case "threads":
        return path.replace(/^\/@/, "@");
      case "bsky.app":
        return path.includes("/profile/") ? (path.split("/profile/")[1] ?? "") : urlStr;
      case "linktree":
        return path.replace(/^\//, "");
      case "patreon":
      case "vimeo":
      case "dev.to":
        return path.replace(/^\//, "");
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

export type SocialEditRow = { platform: string; handle: string };

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
    out.push({ platform, handle: extractHandleForEditing(platform, url) });
  }
  return out;
}

function inferPlatformFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "github.com" || host.endsWith(".github.com") || host === "gist.github.com") return "github";
    if (host.includes("gitlab")) return "gitlab";
    if (host.includes("linkedin.com")) return "linkedin";
    if (host === "x.com" || host === "twitter.com") return "x";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("facebook.com") || host === "fb.com" || host === "m.facebook.com") return "facebook";
    if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
    if (host.includes("twitch.tv")) return "twitch";
    if (host.includes("discord.")) return "discord";
    if (host.includes("reddit.com")) return "reddit";
    if (host.includes("medium.com")) return "medium";
    if (host.includes("spotify.com")) return "spotify";
    if (host.includes("soundcloud.com")) return "soundcloud";
    if (host.includes("tiktok.com")) return "tiktok";
    if (host.includes("pinterest.com")) return "pinterest";
    if (host.includes("dribbble.com")) return "dribbble";
    if (host.includes("figma.com")) return "figma";
    if (host === "threads.net") return "threads";
    if (host.includes("bsky.app")) return "bsky.app";
    if (host.includes("linktr.ee") || host.includes("linktree.com")) return "linktree";
    if (host.includes("patreon.com")) return "patreon";
    if (host.includes("vimeo.com")) return "vimeo";
    if (host === "dev.to") return "dev.to";
    if (host.includes("stackoverflow.com") || host.includes("stackexchange.com")) return "stackoverflow";
    if (host.includes("slack.com")) return "slack";
    if (host.includes("substack.com")) return "substack";
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
