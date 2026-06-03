"use client";

import Image from "next/image";
import { useActiveCustomThemeLogo } from "@/lib/useActiveCustomThemeLogo";

const SIDEBAR_MARK_LIGHT =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-black.svg";
const SIDEBAR_MARK_DARK =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-white.svg";
const SIDEBAR_WIDE_LOGO =
  "https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png";
const SIDEBAR_WIDE_LOGO_ON_DARK =
  "https://assets.kuratorapp.cc/brand/PNG/kurator_wide-white.png";

type Props = {
  /** Collapsed sidebar favicon, expanded desktop wide logo, mobile header, or inverted wide on dark bars. */
  variant: "mark" | "wide" | "wide-mobile" | "wide-on-dark";
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
    if (variant === "wide-on-dark") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={customLogo}
          alt="Kurator"
          className="h-auto max-h-10 w-32 max-w-full object-contain object-left invert"
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

  if (variant === "wide-on-dark") {
    return (
      <Image
        src={SIDEBAR_WIDE_LOGO_ON_DARK}
        alt="Kurator"
        width={256}
        height={128}
        className="h-auto max-h-10 w-32 object-left"
        loading="eager"
      />
    );
  }

  const wideClass =
    variant === "wide-mobile" ? "w-32 invert dark:invert-0" : "w-48 invert dark:invert-0";

  return (
    <Image
      src={SIDEBAR_WIDE_LOGO}
      alt="Kurator"
      width={256}
      height={128}
      className={`h-auto object-left ${wideClass}`}
      loading="eager"
    />
  );
}
