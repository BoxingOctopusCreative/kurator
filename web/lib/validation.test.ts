import { describe, expect, it } from "vitest";
import {
  assertHttpOrHttpsUrl,
  assertStrictPlainText,
  parseAndSanitizeExtraMetadataJson,
  ValidationError,
} from "./validation";

describe("validation", () => {
  it("rejects angle brackets in strict plain text", () => {
    expect(() => assertStrictPlainText("<script>x</script>", 100, "t")).toThrow(ValidationError);
  });

  it("allows safe http(s) URLs only", () => {
    expect(assertHttpOrHttpsUrl("https://example.com/a.png", "u")).toBe("https://example.com/a.png");
    expect(() => assertHttpOrHttpsUrl("javascript:alert(1)", "u")).toThrow(ValidationError);
  });

  it("sanitizes extra metadata JSON strings", () => {
    const o = parseAndSanitizeExtraMetadataJson('{"note":"hello","n":1}');
    expect(o).toEqual({ note: "hello", n: 1 });
  });

  it("rejects script-like strings in extra JSON", () => {
    expect(() => parseAndSanitizeExtraMetadataJson('{"x":"<script>"}')).toThrow(ValidationError);
  });
});
