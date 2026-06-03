import { describe, expect, it } from "vitest";
import { exploreSearchKindLabel } from "@/lib/exploreSearch";

describe("exploreSearchKindLabel", () => {
  it("maps known kinds", () => {
    expect(exploreSearchKindLabel("hitlist_comment")).toBe("Comment");
    expect(exploreSearchKindLabel("board")).toBe("Board");
  });
});
