import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNotificationUnreadCount } from "./api";

describe("fetchNotificationUnreadCount", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unread_count from JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ unread_count: 3 }),
      }),
    );
    await expect(fetchNotificationUnreadCount()).resolves.toBe(3);
  });

  it("truncates and floors non-integer numbers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ unread_count: 4.7 }),
      }),
    );
    await expect(fetchNotificationUnreadCount()).resolves.toBe(4);
  });

  it("returns 0 when unread_count is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }),
    );
    await expect(fetchNotificationUnreadCount()).resolves.toBe(0);
  });

  it("throws on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    );
    await expect(fetchNotificationUnreadCount()).rejects.toThrow(/sign in/i);
  });
});
