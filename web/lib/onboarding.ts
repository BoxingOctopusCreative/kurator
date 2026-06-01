import type { AuthUser } from "@/lib/auth";

export const ONBOARDING_MIN_SHELF_ITEMS = 3;

export type OnboardingStatus = {
  onboarding_completed: boolean;
  onboarding_step: number;
  has_shelves: boolean;
  collection_shelf_id?: string;
  collection_item_count: number;
  wishlist_shelf_id?: string;
  wishlist_entry_count: number;
};

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export function effectiveOnboardingStep(user: AuthUser | null | undefined): OnboardingStep {
  if (!user) return 1;
  const s = user.onboarding_step ?? 0;
  if (s < 1) return 1;
  if (s > 5) return 5;
  return s as OnboardingStep;
}

/** True when the global overlay should run (new user, no shelves, not finished). */
export function shouldRunOnboarding(user: AuthUser | null | undefined): boolean {
  if (!user || user.onboarding_completed || user.has_shelves) {
    return false;
  }
  return true;
}

export function profileStepReady(user: AuthUser): boolean {
  return (
    Boolean(user.display_name?.trim()) &&
    Boolean(user.bio?.trim()) &&
    Boolean(user.avatar_url?.trim())
  );
}

export function mfaStepReady(user: AuthUser): boolean {
  return Boolean(user.two_factor_enabled);
}

async function onboardingApi(path: string, init?: RequestInit) {
  const res = await fetch(`/api/v1/me/onboarding${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.error ?? body?.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<OnboardingStatus>;
}

export async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  return onboardingApi("");
}

export async function advanceOnboardingStep(nextStep: number): Promise<OnboardingStatus> {
  return onboardingApi("", {
    method: "PATCH",
    body: JSON.stringify({ onboarding_step: nextStep }),
  });
}

export async function completeOnboarding(): Promise<OnboardingStatus> {
  return onboardingApi("", {
    method: "PATCH",
    body: JSON.stringify({ onboarding_completed: true }),
  });
}
