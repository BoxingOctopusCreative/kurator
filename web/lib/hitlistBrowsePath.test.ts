import { describe, expect, it } from "vitest";
import { hitlistBrowsePath } from "@/lib/hitlistBrowsePath";

describe("hitlistBrowsePath", () => {
  it("uses permalink for public + slug", () => {
    expect(
      hitlistBrowsePath({
        id: "550e8400-e29b-41d4-a716-446655440000",
        slug: "my-top-10",
        visibility: "public",
      }),
    ).toBe("/hitlists/my-top-10");
  });

  it("encodes slug segments", () => {
    expect(
      hitlistBrowsePath({
        id: "x",
        slug: "a b",
        visibility: "public",
      }),
    ).toBe("/hitlists/a%20b");
  });

  it("falls back to list id when not public", () => {
    expect(
      hitlistBrowsePath({
        id: "abc",
        slug: "secret-slug",
        visibility: "private",
      }),
    ).toBe("/lists/abc");
  });

  it("falls back when public but slug missing", () => {
    expect(
      hitlistBrowsePath({
        id: "abc",
        slug: "",
        visibility: "public",
      }),
    ).toBe("/lists/abc");
  });

  it("uses app list path when preferAppView even with public slug", () => {
    expect(
      hitlistBrowsePath({
        id: "550e8400-e29b-41d4-a716-446655440000",
        slug: "my-top-10",
        visibility: "public",
        preferAppView: true,
      }),
    ).toBe("/lists/550e8400-e29b-41d4-a716-446655440000");
  });
});
