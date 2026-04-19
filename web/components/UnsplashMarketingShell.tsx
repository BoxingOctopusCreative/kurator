"use client";

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
};

/**
 * Full-viewport Unsplash background (tinted layers) + optional attribution footer.
 * Uses the same cache + API fallback as the home landing page.
 */
export function UnsplashMarketingShell({ initialBackground = null, children }: Props) {
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
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {bg && (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.38]"
            style={{ backgroundImage: `url(${bg.url})` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-kurator-bg/72 backdrop-blur-[1px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-linear-to-b from-kurator-bg/88 via-kurator-bg/78 to-kurator-bg/92"
            aria-hidden
          />
        </>
      )}

      <div className="relative z-10 flex min-h-dvh flex-1 flex-col">
        <div className="flex flex-1 flex-col">{children}</div>

        {bg?.photoPageUrl && (
          <p className="shrink-0 px-4 pb-6 text-center text-[11px] text-kurator-muted/80">
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
        )}
      </div>
    </div>
  );
}
