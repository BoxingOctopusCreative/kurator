import { describe, expect, it } from "vitest";
import type { HitlistEntry, Item } from "@/lib/api";
import { hitlistEntryCoverAndTitle, hitlistEntryDisplayMarkdown } from "./hitlistEntryDisplay";

describe("hitlistEntryDisplayMarkdown", () => {
  const baseEntry = (): HitlistEntry => ({
    id: "e1",
    list_id: "l1",
    created_at: new Date().toISOString(),
  });

  it("prefers list entry description over item notes", () => {
    const item: Item = {
      id: "i1",
      title: "T",
      category: "book",
      metadata: { notes: "from item" },
      created_at: "",
      updated_at: "",
    };
    expect(
      hitlistEntryDisplayMarkdown({
        ...baseEntry(),
        description: "  on row ",
        item,
      }),
    ).toBe("on row");
  });

  it("falls back to item metadata.notes", () => {
    const item: Item = {
      id: "i1",
      title: "T",
      category: "game",
      metadata: { notes: "My **description**" },
      created_at: "",
      updated_at: "",
    };
    expect(hitlistEntryDisplayMarkdown({ ...baseEntry(), item })).toBe("My **description**");
  });

  it("uses stub metadata.notes when no item", () => {
    expect(
      hitlistEntryDisplayMarkdown({
        ...baseEntry(),
        stub: {
          title: "S",
          category: "book",
          metadata: { notes: "stub note" },
        },
      }),
    ).toBe("stub note");
  });

  it("returns null when nothing set", () => {
    expect(
      hitlistEntryDisplayMarkdown({
        ...baseEntry(),
        item: {
          id: "i1",
          title: "T",
          category: "music",
          metadata: {},
          created_at: "",
          updated_at: "",
        },
      }),
    ).toBeNull();
  });
});

describe("hitlistEntryCoverAndTitle", () => {
  const baseEntry = (): HitlistEntry => ({
    id: "e1",
    list_id: "l1",
    created_at: new Date().toISOString(),
  });

  it("reads title and category from linked item", () => {
    const item: Item = {
      id: "i1",
      title: "Book One",
      category: "book",
      metadata: {},
      created_at: "",
      updated_at: "",
    };
    expect(hitlistEntryCoverAndTitle({ ...baseEntry(), item })).toEqual({
      cover: null,
      title: "Book One",
      category: "book",
    });
  });

  it("reads from stub when no item", () => {
    expect(
      hitlistEntryCoverAndTitle({
        ...baseEntry(),
        stub: {
          title: "Stub",
          category: "game",
          metadata: {},
        },
      }),
    ).toEqual({
      cover: null,
      title: "Stub",
      category: "game",
    });
  });
});
