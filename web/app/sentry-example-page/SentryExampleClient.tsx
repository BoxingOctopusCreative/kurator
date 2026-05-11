"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useState } from "react";

export function SentryExampleClient() {
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg">Sentry Verification</h1>
        <p className="mt-2 text-sm text-kurator-muted">
          Use these actions to confirm errors reach your Sentry project. Remove this route when you are done.
        </p>
      </div>

      {!dsn && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <code className="font-mono">NEXT_PUBLIC_SENTRY_DSN</code> is not set. Client-side events will not be sent
          until it is configured in <code className="font-mono">.env.local</code>.
        </p>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium text-kurator-fg">Client (browser)</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90"
            onClick={() => {
              throw new Error("Sentry example: uncaught client error");
            }}
          >
            Throw Uncaught Error
          </button>
          <button
            type="button"
            className="rounded-lg border border-kurator-border px-4 py-2 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40"
            onClick={() => {
              Sentry.captureException(new Error("Sentry example: captureException"));
            }}
          >
            Capture Exception
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-kurator-fg">API route (server)</p>
        <button
          type="button"
          className="rounded-lg border border-kurator-border px-4 py-2 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40"
          onClick={async () => {
            setApiMessage(null);
            try {
              const res = await fetch("/api/sentry-example-api");
              const text = await res.text();
              setApiMessage(res.ok ? text : `${res.status}: ${text}`);
            } catch (e) {
              setApiMessage(e instanceof Error ? e.message : "Request failed");
            }
          }}
        >
          GET /api/sentry-example-api
        </button>
        {apiMessage && (
          <p className="text-xs text-kurator-muted" role="status">
            {apiMessage}
          </p>
        )}
      </div>

      <p className="text-sm text-kurator-muted">
        <Link href="/" className="text-kurator-accent underline-offset-2 hover:underline">
          Back to Home
        </Link>
      </p>
    </div>
  );
}
