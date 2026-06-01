import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomThemeSettingsClient } from "@/components/settings/CustomThemeSettingsClient";

export const metadata: Metadata = {
  title: "Custom Theme",
};

export default function CustomThemeSettingsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-kurator-muted">Loading…</p>}>
      <CustomThemeSettingsClient />
    </Suspense>
  );
}
