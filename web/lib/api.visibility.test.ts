import { describe, expect, it } from "vitest";
import { visibilityLabel, visibilityOf } from "./api";

describe("visibilityOf", () => {
  it("prefers explicit visibility", () => {
    expect(visibilityOf({ visibility: "public", is_public: false })).toBe("public");
    expect(visibilityOf({ visibility: "friends" })).toBe("friends");
  });

  it("falls back from legacy is_public", () => {
    expect(visibilityOf({ is_public: false })).toBe("private");
    expect(visibilityOf({ is_public: true })).toBe("followers");
    expect(visibilityOf({})).toBe("followers");
  });
});

describe("visibilityLabel", () => {
  it("includes public and friends only wording", () => {
    expect(visibilityLabel("public")).toBe("Public");
    expect(visibilityLabel("friends")).toBe("Friends only");
  });
});
