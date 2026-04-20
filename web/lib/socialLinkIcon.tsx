import { SocialIcon, networkFor } from "react-social-icons";

import { ALLOWED_SOCIAL_PLATFORM_IDS } from "./socialPlatforms";

const ICON_PX = 22;

/**
 * Brand icon from `react-social-icons` (non-interactive span).
 * Prefer `platform` when known so the icon matches the saved platform even for unusual URLs.
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
  const trimmed = url.trim();
  const p = platform?.trim().toLowerCase() ?? "";
  const network =
    p && ALLOWED_SOCIAL_PLATFORM_IDS.has(p) && p !== "custom" ? p : networkFor(trimmed.length > 0 ? trimmed : undefined);

  return (
    <span
      className={`inline-flex shrink-0 items-center [&_.social-icon]:align-middle ${className}`.trim()}
      aria-hidden
    >
      <SocialIcon as="span" network={network} style={{ width: ICON_PX, height: ICON_PX }} />
    </span>
  );
}
