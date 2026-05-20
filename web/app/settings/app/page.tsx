import { Suspense } from "react";
import { AppSettingsClient } from "@/components/settings/AppSettingsClient";

export default function AppSettingsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-kurator-muted">Loading…</p>}>
      <AppSettingsClient />
    </Suspense>
  );
}
