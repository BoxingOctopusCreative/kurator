import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { patchHitlistEntryDescription } from "./api";

describe("patchHitlistEntryDescription", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {} as Window);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes v2 hitlist entry with JSON description", async () => {
    await patchHitlistEntryDescription("aaa-bbb-ccc", "entry-uuid-1", "Line one");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v2/hitlists/aaa-bbb-ccc/entries/entry-uuid-1",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Line one" }),
      }),
    );
  });
});
