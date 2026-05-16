import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl } from "./apiUrl";

describe("apiUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("defaults relative paths to v1 in the browser", () => {
    vi.stubGlobal("window", {} as Window);
    expect(apiUrl("/collections")).toBe("/api/v1/collections");
    expect(apiUrl("collections")).toBe("/api/v1/collections");
  });

  it("uses v2 when options.version is v2 in the browser", () => {
    vi.stubGlobal("window", {} as Window);
    expect(apiUrl("/hitlists", { version: "v2" })).toBe("/api/v2/hitlists");
  });

  it("preserves explicit /api/v2 prefix in the browser", () => {
    vi.stubGlobal("window", {} as Window);
    expect(apiUrl("/api/v2/hitlists/by-slug/foo")).toBe("/api/v2/hitlists/by-slug/foo");
  });

  it("server-side prefixes with API_INTERNAL_URL", () => {
    vi.stubGlobal("window", undefined);
    process.env.API_INTERNAL_URL = "http://api.internal:8080";
    expect(apiUrl("/me", { version: "v2" })).toBe("http://api.internal:8080/api/v2/me");
  });
});
