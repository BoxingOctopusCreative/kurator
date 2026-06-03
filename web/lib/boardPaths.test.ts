import { describe, expect, it } from "vitest";
import { boardPath, boardThreadPath, isBoardUuid } from "./boardPaths";

describe("boardPaths", () => {
  it("detects UUID board refs", () => {
    expect(isBoardUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isBoardUuid("my-board")).toBe(false);
  });

  it("builds slug paths", () => {
    expect(boardPath("vinyl-talk")).toBe("/boards/vinyl-talk");
    expect(boardThreadPath("vinyl-talk", "550e8400-e29b-41d4-a716-446655440000")).toBe(
      "/boards/vinyl-talk/threads/550e8400-e29b-41d4-a716-446655440000",
    );
  });
});
