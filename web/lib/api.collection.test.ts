import { describe, expect, it } from "vitest";
import { collectionMayReceiveItems, type Collection } from "./api";

function col(partial: Partial<Collection> & Pick<Collection, "id" | "name">): Collection {
  return {
    id: partial.id,
    name: partial.name,
    is_public: partial.is_public ?? true,
    item_count: partial.item_count ?? 0,
    created_at: partial.created_at ?? "",
    updated_at: partial.updated_at ?? "",
    ...partial,
  };
}

describe("collectionMayReceiveItems", () => {
  it("is true when may_edit_entries is true or omitted", () => {
    expect(collectionMayReceiveItems(col({ id: "a", name: "A", may_edit_entries: true }))).toBe(true);
    expect(collectionMayReceiveItems(col({ id: "b", name: "B" }))).toBe(true);
  });

  it("is false when may_edit_entries is false", () => {
    expect(collectionMayReceiveItems(col({ id: "c", name: "C", may_edit_entries: false }))).toBe(false);
  });
});
