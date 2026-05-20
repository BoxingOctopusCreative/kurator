import { afterEach, describe, expect, it, vi } from "vitest";
import {
  navigateToOAuthUrl,
  oauthErrorMessage,
  oauthLinkErrorMessage,
  oauthLinkPath,
  oauthStartPath,
} from "@/lib/oauth";

describe("oauthStartPath", () => {
  it("builds a same-origin start URL with next", () => {
    expect(oauthStartPath("google", "/collections")).toBe(
      "/api/v1/auth/oauth/google?next=%2Fcollections",
    );
  });

  it("defaults next to /", () => {
    expect(oauthStartPath("discord", "  ")).toBe("/api/v1/auth/oauth/discord?next=%2F");
  });
});

describe("oauthLinkPath", () => {
  it("builds authenticated link start URL", () => {
    expect(oauthLinkPath("discord")).toBe("/api/v1/me/oauth/discord/link?next=%2Fsettings%2Fapp");
  });
});

describe("navigateToOAuthUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assigns location for OAuth starts", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    navigateToOAuthUrl("/api/v1/auth/oauth/google?next=%2F");
    expect(assign).toHaveBeenCalledWith("/api/v1/auth/oauth/google?next=%2F");
  });

  it("no-ops when disabled", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    navigateToOAuthUrl("/api/v1/auth/oauth/google", true);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("oauthLinkErrorMessage", () => {
  it("maps link-specific errors", () => {
    expect(oauthLinkErrorMessage("provider_already_linked")).toMatch(/already linked/i);
  });
});

describe("oauthErrorMessage", () => {
  it("maps known codes and falls back", () => {
    expect(oauthErrorMessage("beta_oauth_register_disabled")).toMatch(/private beta/i);
    expect(oauthErrorMessage("password_account")).toMatch(/password/i);
    expect(oauthErrorMessage("unknown_code")).toMatch(/failed/i);
    expect(oauthErrorMessage(null)).toBeNull();
  });
});
