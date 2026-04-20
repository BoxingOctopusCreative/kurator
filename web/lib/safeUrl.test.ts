import { describe, expect, it } from "vitest";
import { safeHttpUrl, safeImageSrcUrl } from "./safeUrl";

describe("safeHttpUrl", () => {
  it("accepts https and http absolute URLs", () => {
    expect(safeHttpUrl("https://example.com/x?y=1")).toBe("https://example.com/x?y=1");
    expect(safeHttpUrl("http://example.com/")).toBe("http://example.com/");
  });

  it("rejects other schemes and protocol-relative", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>")).toBeNull();
    expect(safeHttpUrl("//evil.com")).toBeNull();
    expect(safeHttpUrl("ftp://example.com/")).toBeNull();
  });

  it("rejects relative paths and invalid input", () => {
    expect(safeHttpUrl("/images/a.jpg")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("   ")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("safeImageSrcUrl", () => {
  it("accepts http(s) and root-relative paths", () => {
    expect(safeImageSrcUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    expect(safeImageSrcUrl("/media/cover.jpg")).toBe("/media/cover.jpg");
  });

  it("rejects protocol-relative and non-url schemes", () => {
    expect(safeImageSrcUrl("//evil/img")).toBeNull();
    expect(safeImageSrcUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageSrcUrl("data:image/png;base64,xx")).toBeNull();
  });
});
