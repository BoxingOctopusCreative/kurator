"use client";

import Image from "next/image";
import Link from "next/link";
import { UnsplashMarketingShell } from "@/components/UnsplashMarketingShell";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";
import { Copyright } from "@/components/Copyright";
import { LegalPolicyLinks } from "@/components/LegalPolicyLinks";
import { LandingRotatingSlogans } from "@/components/LandingRotatingSlogans";

type Props = {
  initialBackground?: UnsplashBackgroundPayload | null;
  landingSlogans: string[];
};

export function LandingPage({ initialBackground = null, landingSlogans }: Props) {
  return (
    <UnsplashMarketingShell initialBackground={initialBackground}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="flex w-full flex-col items-center">
          <Image
            src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
            alt="Kurator"
            width={600}
            height={300}
            className="kurator-logo-shadow mb-8 max-w-full h-auto w-auto"
            priority
            loading="eager"
          />
        </div>

        <div className="space-y-4 text-center">
          <p className="text-lg text-kurator-fg">
          Kurator is your one-stop shop for tracking all the physical media that lovingly gathers dust on your shelves; whether it's video games, music, movies, tv, books, comics, and more...
          </p>
          <LandingRotatingSlogans slogans={landingSlogans} />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-kurator-accent px-6 py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-kurator-border px-6 py-2.5 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40"
          >
            Create Account
          </Link>
        </div>

        <LegalPolicyLinks className="mt-10 text-center text-xs text-kurator-muted" />

      </div>
      <Copyright />
    </UnsplashMarketingShell>
  );
}
