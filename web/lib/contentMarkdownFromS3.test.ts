import { describe, expect, it } from "vitest";
import { isS3MissingObjectError } from "@/lib/contentMarkdownS3Errors";

describe("isS3MissingObjectError", () => {
  it("detects NoSuchKey from AWS SDK", () => {
    expect(
      isS3MissingObjectError({
        name: "NoSuchKey",
        Code: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      }),
    ).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isS3MissingObjectError({ name: "AccessDenied" })).toBe(false);
    expect(isS3MissingObjectError(null)).toBe(false);
  });
});
