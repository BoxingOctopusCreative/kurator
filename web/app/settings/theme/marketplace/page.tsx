import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomThemeMarketplaceClient } from "@/components/settings/CustomThemeMarketplaceClient";

export const metadata: Metadata = {
  title: "Theme Marketplace",
};

export default function ThemeMarketplacePage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-kurator-muted">Loading…</p>}>
      <CustomThemeMarketplaceClient />
    </Suspense>
  );
}
