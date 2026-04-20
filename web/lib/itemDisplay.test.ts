import { describe, expect, it } from "vitest";
import { getCoverArtUrl } from "./itemDisplay";

describe("getCoverArtUrl", () => {
  it("returns https, http, and root-relative paths", () => {
    expect(getCoverArtUrl({ cover_art: "https://x/y.png" })).toBe("https://x/y.png");
    expect(getCoverArtUrl({ cover_art: "/media/a.jpg" })).toBe("/media/a.jpg");
  });

  it("rejects protocol-relative and empty", () => {
    expect(getCoverArtUrl({ cover_art: "//evil/a.jpg" })).toBeNull();
    expect(getCoverArtUrl({ cover_art: "   " })).toBeNull();
  });
});
