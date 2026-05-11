import { describe, expect, it } from "vitest";
import {
  brandDomainForSocialPlatform,
  brandfetchLogoCdnUrl,
  googleS2FaviconUrl,
  hostnameForFaviconLookup,
} from "./socialBrandfetch";

describe("hostnameForFaviconLookup", () => {
  it("returns normalized host for https URLs", () => {
    expect(hostnameForFaviconLookup("https://www.example.com/path")).toBe("example.com");
  });

  it("returns null for localhost", () => {
    expect(hostnameForFaviconLookup("http://localhost:3000/")).toBeNull();
  });

  it("returns null for non-http(s)", () => {
    expect(hostnameForFaviconLookup("ftp://example.com/")).toBeNull();
    expect(hostnameForFaviconLookup("")).toBeNull();
  });

  it("returns null for IPv4 literals", () => {
    expect(hostnameForFaviconLookup("http://127.0.0.1/")).toBeNull();
  });
});

describe("googleS2FaviconUrl", () => {
  it("clamps size and encodes host", () => {
    expect(googleS2FaviconUrl("example.com", 64)).toBe(
      "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    );
    expect(googleS2FaviconUrl("example.com", 500)).toContain("sz=128");
    expect(googleS2FaviconUrl("example.com", 8)).toContain("sz=16");
  });
});

describe("brandDomainForSocialPlatform", () => {
  it("maps known platform ids to Brandfetch domains", () => {
    expect(brandDomainForSocialPlatform("github", "https://github.com/octo")).toBe("github.com");
    expect(brandDomainForSocialPlatform("hey.cafe", "https://hey.cafe/@user")).toBe("hey.cafe");
    expect(brandDomainForSocialPlatform("mastodon", "https://mastodon.social/@x")).toBe("joinmastodon.org");
  });

  it("returns null for unknown platform", () => {
    expect(brandDomainForSocialPlatform("not-a-platform", "https://example.com")).toBeNull();
  });

  it("treats custom and empty platform as URL-derived brand host", () => {
    expect(brandDomainForSocialPlatform("custom", "https://www.example.com/path")).toBe("example.com");
    expect(brandDomainForSocialPlatform(undefined, "https://www.example.com/")).toBe("example.com");
    expect(brandDomainForSocialPlatform("custom", "ftp://example.com/")).toBeNull();
    expect(brandDomainForSocialPlatform("custom", "not a url")).toBeNull();
  });
});

describe("brandfetchLogoCdnUrl", () => {
  it("builds CDN path with normalized domain and encoded client id", () => {
    expect(
      brandfetchLogoCdnUrl("Example.COM", "abc123", { width: 64, theme: "dark" }),
    ).toBe(
      "https://cdn.brandfetch.io/example.com/w/64/theme/dark/fallback/lettermark?c=abc123",
    );
  });
});
