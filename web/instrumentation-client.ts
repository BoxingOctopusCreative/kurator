import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
const replayInDev = process.env.NEXT_PUBLIC_SENTRY_REPLAY_IN_DEV === "true";
const useReplay =
  process.env.NODE_ENV !== "development" || replayInDev;

if (dsn) {
  Sentry.init({
    dsn,

    sendDefaultPii: false,

    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    replaysSessionSampleRate: useReplay ? 0.1 : 0,
    replaysOnErrorSampleRate: useReplay ? 1.0 : 0,

    enableLogs: true,

    // Session Replay walks <style> sheets via cssRules; cross-origin sheets
    // log SecurityError warnings in dev (Turbopack / tooling). Replay is off
    // locally unless NEXT_PUBLIC_SENTRY_REPLAY_IN_DEV=true.
    integrations: useReplay ? [Sentry.replayIntegration()] : [],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
