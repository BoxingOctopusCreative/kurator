"use client";

import { useEffect } from "react";
import { useOnboardingOptional } from "@/components/onboarding/OnboardingProvider";

/** Registers a DOM node as the spotlight target for the current onboarding step. */
export function useOnboardingTarget(targetId: string, enabled = true) {
  const onboarding = useOnboardingOptional();
  const active = Boolean(onboarding?.active);
  const step = onboarding?.step ?? 1;

  useEffect(() => {
    if (!onboarding || !enabled || !active) return;
    return () => onboarding.registerTarget(targetId, null);
  }, [onboarding, enabled, active, targetId]);

  const ref = (node: HTMLElement | null) => {
    if (!onboarding || !enabled || !active) return;
    onboarding.registerTarget(targetId, node);
  };

  return { ref, step, active };
}
