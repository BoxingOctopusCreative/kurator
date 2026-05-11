import { describe, expect, it } from "vitest";
import { googleS2FaviconUrl, hostnameForFaviconLookup } from "./socialBrandfetch";

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
