import { describe, expect, it } from "vitest";
import { wishlistMayReceiveItems, type Wishlist } from "./api";

function wl(partial: Partial<Wishlist> & Pick<Wishlist, "id" | "name">): Wishlist {
  return {
    user_id: 1,
    is_public: false,
    entry_count: 0,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("wishlistMayReceiveItems", () => {
  it("is true when may_edit_entries is true or omitted", () => {
    expect(wishlistMayReceiveItems(wl({ id: "a", name: "A", may_edit_entries: true }))).toBe(true);
    expect(wishlistMayReceiveItems(wl({ id: "b", name: "B" }))).toBe(true);
  });

  it("is false when may_edit_entries is false", () => {
    expect(wishlistMayReceiveItems(wl({ id: "c", name: "C", may_edit_entries: false }))).toBe(false);
  });

  it("does not treat legacy is_public as edit permission", () => {
    expect(
      wishlistMayReceiveItems(
        wl({
          id: "d",
          name: "D",
          visibility: "private",
          is_public: false,
          may_edit_entries: false,
        }),
      ),
    ).toBe(false);
    expect(
      wishlistMayReceiveItems(
        wl({
          id: "e",
          name: "E",
          visibility: "public",
          is_public: true,
          may_edit_entries: true,
        }),
      ),
    ).toBe(true);
  });
});
