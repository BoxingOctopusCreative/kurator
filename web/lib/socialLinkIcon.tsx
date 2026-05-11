"use client";

import type { CSSProperties } from "react";
import { useTheme } from "next-themes";
import { SocialIcon, networkFor } from "react-social-icons";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  brandDomainForSocialPlatform,
  brandfetchLogoCdnUrl,
  googleS2FaviconUrl,
  hostnameForFaviconLookup,
} from "@/lib/socialBrandfetch";
import {
  ALLOWED_SOCIAL_PLATFORM_IDS,
  EH_LOGO_ICON_URL,
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

  if (p === "ehnw.ca") {
    return (
      <span
        className={`${iconOuterClass} items-center justify-center ${className}`.trim()}
        style={ICON_OUTER_STYLE}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Kurator-hosted Eh! SVG */}
        <img
          src={EH_LOGO_ICON_URL}
          alt=""
          width={ICON_PX}
          height={ICON_PX}
          className="size-full object-contain object-center"
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

type CustomIconStage = "favicon" | "brandfetch" | "social";

/** “Other website”: favicon via public lookup, then Brandfetch when configured, then `react-social-icons`. */
function CustomOtherWebsiteDecorativeIcon({
  url,
  className = "",
}: {
  url: string;
  className?: string;
}) {
  const trimmed = url.trim();
  const host = useMemo(() => hostnameForFaviconLookup(trimmed), [trimmed]);

  const clientId = brandfetchClientId();
  const resolvedDomain = useMemo(
    () => brandDomainForSocialPlatform("custom", trimmed),
    [trimmed],
  );
  const domain = clientId && resolvedDomain ? resolvedDomain : null;

  const { resolvedTheme } = useTheme();
  const theme: "light" | "dark" = resolvedTheme === "light" ? "light" : "dark";

  const brandfetchSrc = useMemo(() => {
    if (!clientId || !domain) return null;
    return brandfetchLogoCdnUrl(domain, clientId, { width: BRANDFETCH_WIDTH, theme });
  }, [clientId, domain, theme]);

  const initialStage: CustomIconStage = host ? "favicon" : brandfetchSrc ? "brandfetch" : "social";
  const [stage, setStage] = useState<CustomIconStage>(initialStage);

  useEffect(() => {
    setStage(host ? "favicon" : brandfetchSrc ? "brandfetch" : "social");
  }, [host, brandfetchSrc, trimmed]);

  const onFaviconError = useCallback(() => {
    if (brandfetchSrc) setStage("brandfetch");
    else setStage("social");
  }, [brandfetchSrc]);

  const onBrandfetchError = useCallback(() => {
    setStage("social");
  }, []);

  if (stage === "social") {
    return (
      <span
        className={`${iconOuterClass} items-center justify-center [&_.social-icon]:align-middle [&_.social-svg]:rounded-full ${className}`.trim()}
        style={ICON_OUTER_STYLE}
        aria-hidden
      >
        <SocialIcon
          as="span"
          network={networkFor(trimmed.length > 0 ? trimmed : undefined)}
          borderRadius="50%"
          style={{ width: ICON_PX, height: ICON_PX }}
        />
      </span>
    );
  }

  if (stage === "favicon" && host) {
    return (
      <span
        className={`${iconOuterClass} items-center justify-center ${className}`.trim()}
        style={ICON_OUTER_STYLE}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Google favicon lookup (browser hotlink) */}
        <img
          src={googleS2FaviconUrl(host, 64)}
          alt=""
          width={ICON_PX}
          height={ICON_PX}
          className="size-full rounded-full object-contain object-center"
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={onFaviconError}
          suppressHydrationWarning
        />
      </span>
    );
  }

  if (stage === "brandfetch" && brandfetchSrc) {
    return (
      <span
        className={`${iconOuterClass} items-center justify-center ${className}`.trim()}
        style={ICON_OUTER_STYLE}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Brandfetch Logo CDN */}
        <img
          src={brandfetchSrc}
          alt=""
          width={ICON_PX}
          height={ICON_PX}
          className="size-full rounded-full object-contain object-center"
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={onBrandfetchError}
          suppressHydrationWarning
        />
      </span>
    );
  }

  return (
    <span
      className={`${iconOuterClass} items-center justify-center [&_.social-icon]:align-middle [&_.social-svg]:rounded-full ${className}`.trim()}
      style={ICON_OUTER_STYLE}
      aria-hidden
    >
      <SocialIcon
        as="span"
        network={networkFor(trimmed.length > 0 ? trimmed : undefined)}
        borderRadius="50%"
        style={{ width: ICON_PX, height: ICON_PX }}
      />
    </span>
  );
}

/**
 * Brand icon for profile social links — Brandfetch Logo CDN when configured,
 * otherwise `react-social-icons` (+ Hey.Cafe / Eh! official assets).
 *
 * **Other website** (`custom`): tries the site favicon (Google lookup URL), then Brandfetch when
 * configured, then `react-social-icons` URL heuristics.
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
  const p = platform?.trim().toLowerCase() ?? "";
  const clientId = brandfetchClientId();
  const resolvedDomain = useMemo(() => {
    if (p === "custom") return null;
    return brandDomainForSocialPlatform(platform, url);
  }, [p, platform, url]);
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

  if (p === "custom") {
    return <CustomOtherWebsiteDecorativeIcon url={url} className={className} />;
  }

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
