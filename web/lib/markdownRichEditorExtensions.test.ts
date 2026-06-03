import { describe, expect, it } from "vitest";
import { buildMarkdownRichEditorExtensions } from "./markdownRichEditorExtensions";

describe("buildMarkdownRichEditorExtensions", () => {
  it("omits the image extension when allowImages is false", () => {
    const extensions = buildMarkdownRichEditorExtensions({
      variant: "compact",
      placeholder: "Write here…",
      allowImages: false,
    });
    expect(extensions.some((ext) => ext.name === "image")).toBe(false);
  });

  it("includes the image extension when allowImages is true", () => {
    const extensions = buildMarkdownRichEditorExtensions({
      variant: "full",
      placeholder: "Write here…",
      allowImages: true,
    });
    expect(extensions.some((ext) => ext.name === "image")).toBe(true);
  });
});
