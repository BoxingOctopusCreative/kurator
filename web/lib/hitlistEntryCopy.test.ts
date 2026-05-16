import { describe, expect, it } from "vitest";
import type { HitlistEntry, Item } from "@/lib/api";
import { hitlistEntryCopyPayload } from "./hitlistEntryCopy";

describe("hitlistEntryCopyPayload", () => {
  const baseEntry = (): HitlistEntry => ({
    id: "e1",
    list_id: "l1",
    created_at: new Date().toISOString(),
  });

  it("copies from item", () => {
    const item: Item = {
      id: "i1",
      title: "Book",
      category: "book",
      metadata: { notes: "hello" },
      created_at: "",
      updated_at: "",
    };
    const p = hitlistEntryCopyPayload({ ...baseEntry(), item });
    expect(p?.title).toBe("Book");
    expect(p?.category).toBe("book");
    expect(p?.metadata.notes).toBe("hello");
    expect(p?.sourceItem).toBe(item);
  });

  it("copies from stub", () => {
    const p = hitlistEntryCopyPayload({
      ...baseEntry(),
      stub: { title: "S", category: "game", metadata: { platform: "SNES" } },
    });
    expect(p?.title).toBe("S");
    expect(p?.category).toBe("game");
    expect(p?.metadata.platform).toBe("SNES");
    expect(p?.sourceItem).toBeUndefined();
  });

  it("returns null when no item or stub", () => {
    expect(hitlistEntryCopyPayload(baseEntry())).toBeNull();
  });
});
