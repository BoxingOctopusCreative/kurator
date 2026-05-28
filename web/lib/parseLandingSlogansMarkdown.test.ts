import { describe, expect, it } from "vitest";
import { parseLandingSlogansFromMarkdown } from "./parseLandingSlogansMarkdown";

describe("parseLandingSlogansFromMarkdown", () => {
  it("extracts bullet list items and skips headings", () => {
    const markdown = `# Landing slogans

Intro line ignored.

- First slogan.
- Second slogan.
`;

    expect(parseLandingSlogansFromMarkdown(markdown)).toEqual([
      "First slogan.",
      "Second slogan.",
    ]);
  });

  it("supports ordered list items", () => {
    const markdown = `1. One
2. Two`;

    expect(parseLandingSlogansFromMarkdown(markdown)).toEqual(["One", "Two"]);
  });

  it("returns an empty array when there are no list items", () => {
    expect(parseLandingSlogansFromMarkdown("# Title only\n\nNo bullets here.")).toEqual([]);
  });
});
