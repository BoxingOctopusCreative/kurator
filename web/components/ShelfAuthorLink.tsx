"use client";

import Link from "next/link";
import type { ShelfAuthor } from "@/lib/api";
import { safeImageSrcUrl } from "@/lib/safeUrl";

type Props = {
  author: ShelfAuthor;
  /** Avatar only, display name + @handle, bold @handle, or inline linked name (avatar shown elsewhere). */
  variant?: "avatarOnly" | "avatarAndName" | "avatarAndUsername" | "nameOnly";
  className?: string;
  avatarClassName?: string;
  /** Passed to the profile link (e.g. stopPropagation inside another clickable row). */
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

function profileHref(username: string): string {
  return `/people/${encodeURIComponent(username.trim())}`;
}

export function ShelfAuthorLink({
  author,
  variant = "avatarOnly",
  className = "",
  avatarClassName = "",
  onClick,
}: Props) {
  const href = profileHref(author.username);
  const label = author.display_name?.trim() || author.username;
  const avatarSrc = safeImageSrcUrl(author.avatar_url ?? undefined);

  const ring =
    "ring-2 ring-kurator-bg hover:ring-kurator-accent/60 focus-visible:outline-none focus-visible:ring-kurator-accent";

  if (variant === "avatarOnly") {
    return (
      <Link
        href={href}
        title={`${label} (@${author.username})`}
        aria-label={`View ${label} profile`}
        onClick={onClick}
        className={`relative shrink-0 rounded-full ${ring} ${className}`}
      >
        <span
          className={`flex h-7 w-7 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg ${avatarClassName}`}
        >
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- CDN profile URL
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] font-medium uppercase text-kurator-muted">
              {(label.slice(0, 1) || "?").toUpperCase()}
            </span>
          )}
        </span>
      </Link>
    );
  }

  if (variant === "avatarAndName") {
    return (
      <Link
        href={href}
        onClick={onClick}
        className={`group inline-flex max-w-full items-center gap-2 rounded-lg py-0.5 text-left text-kurator-fg transition-colors hover:text-kurator-accent ${className}`}
      >
        <span className={`relative shrink-0 rounded-full ${ring}`}>
          <span
            className={`flex h-9 w-9 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg ${avatarClassName}`}
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN profile URL
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-medium uppercase text-kurator-muted">
                {(label.slice(0, 1) || "?").toUpperCase()}
              </span>
            )}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-kurator-fg group-hover:text-kurator-accent">
            {label}
          </span>
          <span className="block truncate text-xs text-kurator-muted">@{author.username}</span>
        </span>
      </Link>
    );
  }

  if (variant === "avatarAndUsername") {
    return (
      <Link
        href={href}
        title={`@${author.username}`}
        aria-label={`View @${author.username} profile`}
        onClick={onClick}
        className={`group inline-flex max-w-full items-center gap-2 rounded-lg py-0.5 text-left transition-colors hover:text-kurator-accent ${className}`}
      >
        <span className={`relative shrink-0 rounded-full ${ring}`}>
          <span
            className={`flex h-8 w-8 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg ${avatarClassName}`}
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN profile URL
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-kurator-muted">
                {(author.username.slice(0, 1) || "?").toUpperCase()}
              </span>
            )}
          </span>
        </span>
        <span className="truncate text-sm font-semibold text-kurator-fg group-hover:text-kurator-accent">
          @{author.username}
        </span>
      </Link>
    );
  }

  if (variant === "nameOnly") {
    return (
      <Link
        href={href}
        title={`${label} (@${author.username})`}
        onClick={onClick}
        className={`font-medium text-kurator-fg hover:text-kurator-accent ${className}`}
      >
        {label}
      </Link>
    );
  }

  return null;
}
