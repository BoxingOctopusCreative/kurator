import { describe, expect, it } from "vitest";
import type { AuthUser } from "@/lib/auth";
import {
  effectiveOnboardingStep,
  mfaStepReady,
  profileStepReady,
  shouldRunOnboarding,
} from "@/lib/onboarding";

const baseUser = {
  id: 1,
  email: "a@b.co",
  username: "user",
  username_locked: true,
  profile_is_public: true,
  display_name: "",
  first_name: "",
  last_name: "",
  first_name_public: false,
  last_name_public: false,
  location: "",
  bio: "",
  theme_preference: "system",
  avatar_url: null,
  banner_url: null,
  social_links: [],
  two_factor_enabled: false,
  created_at: "",
  updated_at: "",
} satisfies AuthUser;

describe("shouldRunOnboarding", () => {
  it("is false when completed or user has shelves", () => {
    expect(shouldRunOnboarding({ ...baseUser, onboarding_completed: true })).toBe(false);
    expect(shouldRunOnboarding({ ...baseUser, has_shelves: true })).toBe(false);
  });

  it("is true for new users without shelves", () => {
    expect(
      shouldRunOnboarding({
        ...baseUser,
        onboarding_completed: false,
        onboarding_step: 1,
        has_shelves: false,
      }),
    ).toBe(true);
  });
});

describe("effectiveOnboardingStep", () => {
  it("maps 0 to step 1", () => {
    expect(effectiveOnboardingStep({ ...baseUser, onboarding_step: 0 })).toBe(1);
  });

  it("caps steps above 5", () => {
    expect(effectiveOnboardingStep({ ...baseUser, onboarding_step: 9 })).toBe(5);
  });
});

describe("mfaStepReady", () => {
  it("requires two_factor_enabled", () => {
    expect(mfaStepReady(baseUser)).toBe(false);
    expect(mfaStepReady({ ...baseUser, two_factor_enabled: true })).toBe(true);
  });
});

describe("profileStepReady", () => {
  it("requires display name, bio, and avatar", () => {
    expect(profileStepReady(baseUser)).toBe(false);
    expect(
      profileStepReady({
        ...baseUser,
        display_name: "Ada",
        bio: "Collector",
        avatar_url: "https://cdn.example/a.jpg",
      }),
    ).toBe(true);
  });
});
