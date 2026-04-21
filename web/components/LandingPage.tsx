"use client";

import Image from "next/image";
import Link from "next/link";
import { UnsplashMarketingShell } from "@/components/UnsplashMarketingShell";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";
import { Copyright } from "@/components/Copyright";

type Props = {
  initialBackground?: UnsplashBackgroundPayload | null;
};

const showDatabaseSetupLink =
  process.env.NEXT_PUBLIC_SHOW_DATABASE_SETUP === "true" ||
  process.env.NEXT_PUBLIC_SHOW_DATABASE_SETUP === "1";

export function LandingPage({ initialBackground = null }: Props) {
  return (
    <UnsplashMarketingShell initialBackground={initialBackground}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="flex w-full flex-col items-center">
          <Image
            src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
            alt="Kurator"
            width={600}
            height={300}
            className="mb-8 max-w-full h-auto w-auto filter-[drop-shadow(0_2px_6px_rgba(0,0,0,0.5))_drop-shadow(0_8px_28px_rgba(0,0,0,0.5))]"
            priority
            loading="eager"
          />
        </div>

        <div className="space-y-4 text-center">
          <p className="text-lg text-kurator-fg">
            Kurator is your personal collection tracker — organize games, music, books, movies, TV, anime, comics, and
            manga in one place.
          </p>
          <p className="text-sm leading-relaxed text-kurator-muted">
            Catalog what you own, add details, search your library, and keep shelves tidy. Sign in to manage your
            collection—it stays yours.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-kurator-accent px-6 py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-kurator-border px-6 py-2.5 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40"
          >
            Create account
          </Link>
        </div>

        <p className="mt-10 text-center text-xs text-kurator-muted">
          <Link href="/privacy" className="text-kurator-accent/90 hover:underline">
            Privacy Policy
          </Link>
        </p>

        {showDatabaseSetupLink && (
          <p className="mt-4 text-center text-xs text-kurator-muted">
            <Link href="/setup" className="text-kurator-accent/90 hover:underline">
              Database setup
            </Link>
            <span className="text-kurator-muted/70"> — first-time install</span>
          </p>
        )}
      </div>
      <Copyright />
    </UnsplashMarketingShell>
  );
}
