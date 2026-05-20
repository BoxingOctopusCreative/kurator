import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import { AppSettingsClient } from "./AppSettingsClient";

const mockFetchMe = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth")>();
  return {
    ...actual,
    fetchMe: mockFetchMe,
  };
});

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    refresh: vi.fn(),
    user: null,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/settings/app",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/oauth", () => ({
  oauthLinkErrorMessage: () => null,
  oauthLinkedSuccessMessage: () => null,
}));

vi.mock("@/components/settings/AppSettingsOAuthSection", () => ({
  AppSettingsOAuthSection: () => null,
}));

vi.mock("@/components/ThemePreferenceSelect", () => ({
  ThemePreferenceSelect: () => <div data-testid="theme-preference-stub" />,
}));

vi.mock("@/components/ColorSchemeSelect", () => ({
  ColorSchemeSelect: () => <div data-testid="color-scheme-stub" />,
}));

vi.mock("@/components/FontFamilySelect", () => ({
  FontFamilySelect: () => <div data-testid="font-family-stub" />,
}));

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    email: "user@example.com",
    username: "user",
    username_locked: false,
    profile_is_public: true,
    display_name: "User",
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
    ...overrides,
  };
}

describe("AppSettingsClient", () => {
  beforeEach(() => {
    mockFetchMe.mockReset();
  });

  it("renders app settings after profile loads", async () => {
    mockFetchMe.mockResolvedValue(makeUser());
    render(<AppSettingsClient />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "App Settings" })).toBeInTheDocument();
    });
    expect(screen.getByText(/Signed in as user@example\.com/)).toBeInTheDocument();
  });

  it("opens authenticator modal when changing password with 2FA enabled", async () => {
    const userEvt = userEvent.setup();
    mockFetchMe.mockResolvedValue(makeUser({ two_factor_enabled: true }));

    render(<AppSettingsClient />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "App Settings" })).toBeInTheDocument();
    });

    await userEvt.type(screen.getByLabelText(/^New password$/), "newpw1234");
    await userEvt.type(screen.getByLabelText(/^Confirm new password$/), "newpw1234");

    await userEvt.click(screen.getByRole("button", { name: /Continue with Authenticator/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Confirm with Authenticator" })).toBeInTheDocument();
  });
});
