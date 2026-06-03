import type { PublicUser, ShelfAuthor } from "@/lib/api";

/** Normalize API user shapes for {@link ShelfAuthorLink}. */
export function toShelfAuthor(
  u: Pick<PublicUser, "username" | "display_name" | "avatar_url"> | ShelfAuthor,
): ShelfAuthor {
  return {
    username: u.username,
    display_name: u.display_name ?? "",
    avatar_url: u.avatar_url ?? null,
  };
}

/** Build a {@link ShelfAuthor} from a stored `/people/{username}` profile URL. */
export function shelfAuthorFromProfileUrl(
  profileUrl: string | undefined | null,
  displayName: string,
): ShelfAuthor | null {
  if (!profileUrl?.trim()) return null;
  const match = profileUrl.match(/\/people\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    return {
      username: decodeURIComponent(match[1]),
      display_name: displayName,
      avatar_url: null,
    };
  } catch {
    return null;
  }
}
