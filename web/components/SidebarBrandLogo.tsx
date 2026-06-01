"use client";

import Image from "next/image";
import { useActiveCustomThemeLogo } from "@/lib/useActiveCustomThemeLogo";

const SIDEBAR_MARK_LIGHT =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-black.svg";
const SIDEBAR_MARK_DARK =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-white.svg";
const SIDEBAR_WIDE_LOGO =
  "https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png";

type Props = {
  /** Collapsed sidebar favicon, expanded desktop wide logo, or mobile header wide logo. */
  variant: "mark" | "wide" | "wide-mobile";
};

export function SidebarBrandLogo({ variant }: Props) {
  const customLogo = useActiveCustomThemeLogo();

  if (customLogo) {
    if (variant === "mark") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={customLogo} alt="Kurator" className="h-8 w-8 object-contain" />
      );
    }
    if (variant === "wide-mobile") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={customLogo}
          alt="Kurator"
          className="h-auto max-h-10 w-32 max-w-full object-contain object-left"
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={customLogo}
        alt="Kurator"
        className="h-auto max-h-12 w-48 max-w-full object-contain"
      />
    );
  }

  if (variant === "mark") {
    return (
      <>
        <Image
          src={SIDEBAR_MARK_LIGHT}
          alt="Kurator"
          width={32}
          height={32}
          className="h-8 w-8 dark:hidden"
          loading="eager"
        />
        <Image
          src={SIDEBAR_MARK_DARK}
          alt="Kurator"
          width={32}
          height={32}
          className="hidden h-8 w-8 dark:block"
          loading="eager"
        />
      </>
    );
  }

  return (
    <Image
      src={SIDEBAR_WIDE_LOGO}
      alt="Kurator"
      width={256}
      height={128}
      className={`h-auto object-left ${variant === "wide-mobile" ? "w-32 invert dark:invert-0" : "w-48 invert dark:invert-0"}`}
      loading="eager"
    />
  );
}
