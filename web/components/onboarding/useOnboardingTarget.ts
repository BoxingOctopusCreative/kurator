"use client";

import { useEffect } from "react";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";

/** Registers a DOM node as the spotlight target for the current onboarding step. */
export function useOnboardingTarget(targetId: string, enabled = true) {
  const { registerTarget, step, active } = useOnboarding();

  useEffect(() => {
    if (!enabled || !active) return;
    return () => registerTarget(targetId, null);
  }, [enabled, active, targetId, registerTarget]);

  const ref = (node: HTMLElement | null) => {
    if (!enabled || !active) return;
    registerTarget(targetId, node);
  };

  return { ref, step, active };
}
