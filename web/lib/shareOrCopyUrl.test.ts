import { afterEach, describe, expect, it, vi } from "vitest";
import { shareOrCopyUrl } from "@/lib/shareOrCopyUrl";

describe("shareOrCopyUrl", () => {
  const origNav = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "navigator", {
      value: origNav,
      configurable: true,
    });
  });

  it("copies when share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText } },
      configurable: true,
    });
    await expect(shareOrCopyUrl("https://example.com/a")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://example.com/a");
  });

  it("returns shared when share succeeds", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { share, clipboard: { writeText: vi.fn() } },
      configurable: true,
    });
    await expect(
      shareOrCopyUrl("https://example.com/b", { title: "Hi", text: "Hello" }),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Hi",
      text: "Hello",
      url: "https://example.com/b",
    });
  });

  it("returns cancelled on AbortError and does not copy", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("abort", "AbortError"));
    const writeText = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      value: { share, clipboard: { writeText } },
      configurable: true,
    });
    await expect(shareOrCopyUrl("https://example.com/c")).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when share rejects for other reasons", async () => {
    const share = vi.fn().mockRejectedValue(new Error("not allowed"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { share, clipboard: { writeText } },
      configurable: true,
    });
    await expect(shareOrCopyUrl("https://example.com/d")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://example.com/d");
  });
});
