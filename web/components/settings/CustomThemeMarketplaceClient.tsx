"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { useAuth } from "@/components/AuthProvider";
import { CustomThemeMarketplace } from "@/components/settings/CustomThemeMarketplace";
import { isProPlan } from "@/lib/billing";

export function CustomThemeMarketplaceClient() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user === null) {
      router.replace("/login?next=/settings/theme/marketplace");
    }
  }, [user, router]);

  if (user === undefined || user === null) {
    return (
      <div className="mx-auto max-w-5xl text-sm text-kurator-muted">
        {user === undefined ? "Loading…" : "Redirecting to login…"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold text-kurator-fg">Theme Marketplace</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Discover themes from other Pro users or manage your theme library.
          </p>
        </div>
      </PageHeroUnsplash>

      <div className="rounded-xl border border-kurator-border bg-kurator-surface p-6 sm:p-8 shadow-surface">
        <CustomThemeMarketplace userId={user.id} isPro={isProPlan(user.plan)} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/settings/theme" className="text-kurator-accent hover:underline">
          Custom Theme editor
        </Link>
        <Link href="/settings/app" className="text-kurator-accent hover:underline">
          App Settings
        </Link>
      </div>
    </div>
  );
}
