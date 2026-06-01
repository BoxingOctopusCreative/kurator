"use client";

import Link from "next/link";

export function CustomThemeUpsell() {
  return (
    <div className="rounded-xl border border-kurator-border bg-kurator-surface p-8 shadow-surface">
      <p className="text-xs font-medium uppercase tracking-wide text-kurator-accent">Kurator Pro</p>
      <h2 className="mt-2 text-xl font-semibold text-kurator-fg">Custom Theme YAML</h2>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-kurator-muted">
        Pro unlocks a full theme editor: upload or paste YAML, tune colours and typography with a visual
        token picker, preview your changes live, and optionally publish themes for others to browse.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-kurator-muted">
        <li>Strict schema validation and safe YAML parsing</li>
        <li>Google Fonts and Adobe Typekit support in preview</li>
        <li>Iconify icon sets with live preview</li>
        <li>Publish immutable versions to the theme gallery</li>
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/settings/billing"
          className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90"
        >
          Upgrade to Pro
        </Link>
        <Link
          href="/settings/app"
          className="rounded-lg border border-kurator-border px-4 py-2 text-sm text-kurator-muted hover:bg-kurator-border/40 hover:text-kurator-fg"
        >
          Back to App Settings
        </Link>
      </div>
    </div>
  );
}
