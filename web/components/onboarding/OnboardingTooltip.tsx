"use client";

import type { OnboardingStep } from "@/lib/onboarding";

type Props = {
  step: OnboardingStep;
  title: string;
  body: string;
  progressLabel: string;
  canContinue: boolean;
  continueLabel?: string;
  busy?: boolean;
  onContinue?: () => void;
};

export function OnboardingTooltip({
  step,
  title,
  body,
  progressLabel,
  canContinue,
  continueLabel = "Continue",
  busy = false,
  onContinue,
}: Props) {
  return (
    <div
      className="pointer-events-auto fixed bottom-6 left-1/2 z-[210] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-kurator-border bg-kurator-surface p-5 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-tooltip-title"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-kurator-muted">
        Step {step} of 5 · {progressLabel}
      </p>
      <h2 id="onboarding-tooltip-title" className="mt-2 text-lg font-semibold text-kurator-fg">
        {title}
      </h2>
      <p className="mt-2 text-sm text-kurator-muted">{body}</p>
      {onContinue ? (
        <button
          type="button"
          disabled={!canContinue || busy}
          onClick={onContinue}
          className="mt-4 w-full rounded-lg bg-kurator-accent px-4 py-2.5 text-sm font-semibold text-kurator-onAccent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : continueLabel}
        </button>
      ) : null}
    </div>
  );
}
