"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";
import {
  readUnsplashBackgroundCache,
  readUnsplashBackgroundLastSuccess,
  writeUnsplashBackgroundCache,
  writeUnsplashBackgroundLastSuccess,
} from "@/lib/unsplash-background-cache";

type Props = {
  initialBackground?: UnsplashBackgroundPayload | null;
  children: ReactNode;
  /**
   * When set (including `null`), controls the footer credit line instead of the default
   * “Background: Photo…” Unsplash line. Use `null` to hide attribution entirely.
   */
  attribution?: ReactNode | null;
};

/**
 * Full-viewport Unsplash background (tinted layers) + optional attribution footer.
 * Uses the same cache + API fallback as the home landing page.
 */
export function UnsplashMarketingShell({
  initialBackground = null,
  children,
  attribution: attributionOverride,
}: Props) {
  const [bg, setBg] = useState<UnsplashBackgroundPayload | null>(() =>
    initialBackground?.url ? initialBackground : null,
  );

  useEffect(() => {
    let cancelled = false;

    function persistSuccess(payload: UnsplashBackgroundPayload) {
      writeUnsplashBackgroundCache(payload);
      writeUnsplashBackgroundLastSuccess(payload);
    }

    function applyLastSuccessFallback() {
      const last = readUnsplashBackgroundLastSuccess();
      if (!cancelled && last?.url) {
        setBg(last);
      }
    }

    if (initialBackground?.url) {
      persistSuccess(initialBackground);
      return;
    }

    const cached = readUnsplashBackgroundCache();
    if (cached?.url) {
      setBg(cached);
      writeUnsplashBackgroundLastSuccess(cached);
      return;
    }

    fetch("/api/unsplash-background")
      .then(async (r) => {
        if (!r.ok) {
          applyLastSuccessFallback();
          return;
        }
        const data = (await r.json()) as UnsplashBackgroundPayload | null;
        if (!cancelled && data?.url) {
          setBg(data);
          persistSuccess(data);
        } else {
          applyLastSuccessFallback();
        }
      })
      .catch(() => {
        applyLastSuccessFallback();
      });

    return () => {
      cancelled = true;
    };
  }, [initialBackground]);

  return (
    <div className="relative isolate flex h-dvh w-full max-w-none flex-col overflow-hidden">
      {bg && (
        <>
          {/*
            Use next/image instead of CSS background-image so URLs with query params cannot break
            url() parsing, and loading is explicit. Tint uses solid bg + opacity (not bg-kurator-bg/xx)
            so we never rely on Tailwind’s color-mix fallback, which can render fully opaque and hide
            the photo in some browsers.
          */}
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-kurator-bg">
            <Image
              alt=""
              src={bg.url}
              fill
              className="object-cover object-center border-0! shadow-none! outline-none! ring-0 transform-[translateZ(0)_scale(1.03)]"
              sizes="100vw"
              fetchPriority="low"
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 z-1 bg-kurator-bg opacity-45 backdrop-blur-[1px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 z-2 bg-kurator-bg opacity-70 mask-[linear-gradient(to_bottom,transparent,black)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black)]"
            aria-hidden
          />
        </>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
          <div className="flex min-h-full min-w-0 flex-1 flex-col">{children}</div>
        </div>

        {attributionOverride !== undefined ? (
          attributionOverride === null ? null : (
            <p className="shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-2 text-center text-[11px] text-kurator-muted/80">
              {attributionOverride}
            </p>
          )
        ) : (
          bg?.photoPageUrl && (
            <p className="shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-2 text-center text-[11px] text-kurator-muted/80">
              Background:{" "}
              <a
                href={bg.photoPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-kurator-muted underline decoration-kurator-border underline-offset-2 hover:text-kurator-fg"
              >
                Photo
              </a>
              {bg.photographer && (
                <>
                  {" "}
                  by{" "}
                  {bg.photographerUrl ? (
                    <a
                      href={bg.photographerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-kurator-muted underline decoration-kurator-border underline-offset-2 hover:text-kurator-fg"
                    >
                      {bg.photographer}
                    </a>
                  ) : (
                    bg.photographer
                  )}{" "}
                  on{" "}
                  <a
                    href="https://unsplash.com/?utm_source=kurator&utm_medium=referral"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-kurator-muted underline decoration-kurator-border underline-offset-2 hover:text-kurator-fg"
                  >
                    Unsplash
                  </a>
                </>
              )}
            </p>
          )
        )}
      </div>
    </div>
  );
}
