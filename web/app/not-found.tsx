"use client";

import Image from "next/image";
import Link from "next/link";
import { UnsplashMarketingShell } from "@/components/UnsplashMarketingShell";

const NOT_FOUND_BG = {
  url: "https://assets.kuratorapp.cc/misc/etienne-girardet-OA0qcP6GOw0-unsplash.jpg",
  photographer: "Etienne Girardet",
  photographerUrl:
    "https://unsplash.com/@etiennegirardet?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText",
  photoPageUrl:
    "https://unsplash.com/photos/a-pile-of-black-and-white-wires-and-a-cassette-OA0qcP6GOw0?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText",
} as const;

const creditLinkClass =
  "text-kurator-muted underline decoration-kurator-border underline-offset-2 hover:text-kurator-fg";

export default function NotFound() {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <UnsplashMarketingShell
        initialBackground={NOT_FOUND_BG}
        attribution={
          <>
            Photo by{" "}
            <a
              href={NOT_FOUND_BG.photographerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={creditLinkClass}
            >
              Etienne Girardet
            </a>{" "}
            on{" "}
            <a
              href={NOT_FOUND_BG.photoPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={creditLinkClass}
            >
              Unsplash
            </a>
          </>
        }
      >
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
              alt="Kurator"
              width={480}
              height={240}
              className="max-w-[min(100%,420px)] h-auto w-auto filter-[drop-shadow(0_2px_6px_rgba(0,0,0,0.45))_drop-shadow(0_8px_24px_rgba(0,0,0,0.45))]"
              priority
              loading="eager"
            />
          </div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-kurator-muted">Error 404</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-kurator-fg md:text-4xl">Page Not Found</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-kurator-muted">
            That link may be broken, or the page may have moved. Try heading home and navigating from there.
          </p>
          <Link
            href="/"
            className="mt-10 inline-flex rounded-lg bg-kurator-accent px-5 py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90"
          >
            Back to Home
          </Link>
        </div>
      </UnsplashMarketingShell>
    </div>
  );
}
