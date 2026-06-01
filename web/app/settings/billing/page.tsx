import { Suspense } from "react";
import { BillingSettingsClient } from "@/components/settings/BillingSettingsClient";
import { loadBillingPlansMarkdown } from "@/lib/billingPlansMarkdown";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const { markdown: plansMarkdown } = await loadBillingPlansMarkdown();

  return (
    <Suspense fallback={<p className="p-8 text-sm text-kurator-muted">Loading…</p>}>
      <BillingSettingsClient plansMarkdown={plansMarkdown} />
    </Suspense>
  );
}
