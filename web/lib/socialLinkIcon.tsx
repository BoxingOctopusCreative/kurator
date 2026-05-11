"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { SocialIcon, networkFor } from "react-social-icons";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  brandDomainForSocialPlatform,
  brandfetchLogoCdnUrl,
} from "@/lib/socialBrandfetch";
import {
  ALLOWED_SOCIAL_PLATFORM_IDS,
  HEY_CAFE_ICON_URL,
  SOCIAL_ICON_USE_NETWORK_FOR_URL,
} from "@/lib/socialPlatforms";

/** Display size (px) for profile social glyphs — logos are clipped/centered in a round frame. */
const ICON_PX = 32;

/** Requested CDN width — higher keeps Brandfetch raster assets sharper at ICON_PX. */
const BRANDFETCH_WIDTH = 192;

function brandfetchClientId(): string | undefined {
  return process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID?.trim() || undefined;
}

/** Round chip behind glyphs — dimensions follow ICON_PX. */
const ICON_OUTER_STYLE: CSSProperties = { width: ICON_PX, height: ICON_PX };
const iconOuterClass = "inline-flex shrink-0 overflow-hidden rounded-full align-middle";

function LegacySocialDecorationIcon({
  url,
  platform,
  className = "",
}: {
  url: string;
  platform?: string;
  className?: string;
}) {
  const trimmed = url.trim();
  const p = platform?.trim().toLowerCase() ?? "";

  if (p === "hey.cafe") {
    return (
      <span
        className={`${iconOuterClass} items-center justify-center ${className}`.trim()}
        style={ICON_OUTER_STYLE}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external Hey.Cafe SVG CDN */}
        <img
          src={HEY_CAFE_ICON_URL}
          alt=""
          width={ICON_PX}
          height={ICON_PX}
          className="size-full object-cover"
        />
      </span>
    );
  }

  const useBundledNetworkKey =
    p &&
    ALLOWED_SOCIAL_PLATFORM_IDS.has(p) &&
    p !== "custom" &&
    !SOCIAL_ICON_USE_NETWORK_FOR_URL.has(p);
  const network = useBundledNetworkKey
    ? p
    : networkFor(trimmed.length > 0 ? trimmed : undefined);

  return (
    <span
      className={`${iconOuterClass} items-center justify-center [&_.social-icon]:align-middle [&_.social-svg]:rounded-full ${className}`.trim()}
      style={ICON_OUTER_STYLE}
      aria-hidden
    >
      <SocialIcon
        as="span"
        network={network}
        borderRadius="50%"
        style={{ width: ICON_PX, height: ICON_PX }}
      />
    </span>
  );
}

/**
 * Brand icon for profile social links — Brandfetch Logo CDN when configured,
 * otherwise `react-social-icons` (+ Hey.Cafe official asset).
 *
 * Uses direct browser embedding of CDN URLs only (Brandfetch hotlinking policy).
 * @see https://docs.brandfetch.com/get-started
 */
export function SocialLinkDecorativeIcon({
  url,
  platform,
  className = "",
}: {
  url: string;
  platform?: string;
  className?: string;
}) {
  const clientId = brandfetchClientId();
  const resolvedDomain = useMemo(
    () => brandDomainForSocialPlatform(platform, url),
    [platform, url],
  );
  const domain = clientId && resolvedDomain ? resolvedDomain : null;
  const { resolvedTheme } = useTheme();
  const theme: "light" | "dark" = resolvedTheme === "light" ? "light" : "dark";
  const [useLegacy, setUseLegacy] = useState(false);

  const src = useMemo(() => {
    if (!clientId || !domain) return null;
    return brandfetchLogoCdnUrl(domain, clientId, { width: BRANDFETCH_WIDTH, theme });
  }, [clientId, domain, theme]);

  const onLogoError = useCallback(() => {
    setUseLegacy(true);
  }, []);

  useEffect(() => {
    setUseLegacy(false);
  }, [src, platform, url]);

  if (!src || useLegacy) {
    return <LegacySocialDecorationIcon url={url} platform={platform} className={className} />;
  }

  return (
    <span
      className={`${iconOuterClass} items-center justify-center ${className}`.trim()}
      style={ICON_OUTER_STYLE}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Brandfetch Logo CDN (browser hotlink only) */}
      <img
        src={src}
        alt=""
        width={ICON_PX}
        height={ICON_PX}
        className="size-full rounded-full object-contain object-center"
        decoding="async"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={onLogoError}
        suppressHydrationWarning
      />
    </span>
  );
}
