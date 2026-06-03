"use client";

import { MessageSquare } from "lucide-react";
import { safeImageSrcUrl } from "@/lib/safeUrl";

type Props = {
  iconUrl?: string | null;
  name: string;
  className?: string;
};

/** Square board icon (subreddit-style); falls back to a generic glyph. */
export function BoardIcon({ iconUrl, name, className = "h-12 w-12" }: Props) {
  const src = safeImageSrcUrl(iconUrl);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`shrink-0 rounded-full border border-kurator-border object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border border-kurator-border bg-kurator-bg text-kurator-muted ${className}`}
      aria-hidden
    >
      <MessageSquare className="h-1/2 w-1/2" />
      <span className="sr-only">{name}</span>
    </span>
  );
}
