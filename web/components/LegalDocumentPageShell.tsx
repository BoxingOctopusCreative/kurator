"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { UnsplashMarketingShell } from "@/components/UnsplashMarketingShell";
import { useAuth } from "@/components/AuthProvider";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";
import { readPageHeroBannerCache, writePageHeroBannerCache } from "@/lib/unsplash-page-hero-cache";

const KURATOR_LOGO_URL = "https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png";

type Props = {
  bannerPath: string;
  initialBackground?: UnsplashBackgroundPayload | null;
  children: ReactNode;
};

/**
 * Full-bleed Unsplash backdrop + fixed logo + card with scrollable body at 75% surface opacity.
 */
export function LegalDocumentPageShell({ bannerPath, initialBackground = null, children }: Props) {
  const { user } = useAuth();
  const [bg, setBg] = useState<UnsplashBackgroundPayload | null>(() =>
    initialBackground?.url ? initialBackground : null,
  );

  useEffect(() => {
    let cancelled = false;

    if (initialBackground?.url) {
      writePageHeroBannerCache(bannerPath, initialBackground);
      return;
    }

    const cached = readPageHeroBannerCache(bannerPath);
    if (cached?.url) {
      setBg(cached);
      return;
    }

    const pathParam = encodeURIComponent(bannerPath);
    void fetch(`/api/unsplash-page-banner?path=${pathParam}`, { cache: "default" })
      .then(async (r) => {
        if (r.status === 204 || !r.ok) return;
        const data = (await r.json()) as UnsplashBackgroundPayload | null;
        if (!cancelled && data?.url) {
          setBg(data);
          writePageHeroBannerCache(bannerPath, data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [initialBackground, bannerPath]);

  const shellBg = initialBackground?.url ? initialBackground : bg;
  const fill = user ? "region" : "viewport";

  const bleedWrapperClass = user
    ? "relative flex h-[calc(100dvh-7.75rem)] min-h-0 w-[100cqw] max-w-none flex-1 flex-col overflow-hidden [margin-inline:calc((100%-100cqw)/2)] -mt-5 md:h-[calc(100dvh-5.5rem)] md:max-h-[calc(100dvh-5.5rem)]"
    : "flex h-dvh min-h-0 w-full flex-col overflow-hidden";

  return (
    <div className={bleedWrapperClass}>
      <UnsplashMarketingShell
        initialBackground={shellBg}
        fill={fill}
        scrollChildren={false}
      >
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-4 py-4 md:py-6">
          <Link
            href="/"
            className="mb-4 flex w-full max-w-lg shrink-0 justify-center md:mb-5"
            aria-label="Kurator home"
          >
            <Image
              src={KURATOR_LOGO_URL}
              alt="Kurator"
              width={600}
              height={300}
              className="kurator-logo-shadow h-auto w-full max-w-md md:max-w-lg"
              priority
            />
          </Link>

          <div className="flex min-h-0 w-[92%] max-w-5xl flex-1 flex-col overflow-hidden rounded-xl border border-kurator-border/50 bg-kurator-surface/75 shadow-lg backdrop-blur-md">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-7 md:px-10 md:py-9">
              {children}
            </div>
          </div>
        </div>
      </UnsplashMarketingShell>
    </div>
  );
}
