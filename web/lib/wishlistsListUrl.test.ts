import { describe, expect, it } from "vitest";
import {
  filterWishlistsByQuery,
  parseWishlistsListRecord,
  parseWishlistsListSearchString,
  stringifyWishlistsListFilters,
} from "./wishlistsListUrl";
import type { Wishlist } from "./api";

function wl(partial: Partial<Wishlist> & Pick<Wishlist, "id" | "name">): Wishlist {
  return {
    id: partial.id,
    user_id: partial.user_id ?? 1,
    name: partial.name,
    is_public: partial.is_public ?? false,
    entry_count: partial.entry_count ?? 0,
    created_at: partial.created_at ?? "",
    updated_at: partial.updated_at ?? "",
    ...partial,
  };
}

describe("wishlistsListUrl", () => {
  it("parses record defaults", () => {
    expect(parseWishlistsListRecord({})).toEqual({ q: "" });
  });

  it("stringify omits empty q and round-trips", () => {
    const f = parseWishlistsListRecord({ q: "  vinyl  " });
    expect(f.q).toBe("  vinyl  ");
    const qs = stringifyWishlistsListFilters({ ...f, q: f.q.trim() });
    expect(qs).toBe("q=vinyl");
    const back = parseWishlistsListSearchString(`?${qs}`);
    expect(back.q).toBe("vinyl");
  });
});

describe("filterWishlistsByQuery", () => {
  it("returns all when q is empty", () => {
    const list = [wl({ id: "1", name: "A" })];
    expect(filterWishlistsByQuery(list, "")).toEqual(list);
    expect(filterWishlistsByQuery(list, "   ")).toEqual(list);
  });

  it("matches name or description case-insensitively", () => {
    const list = [
      wl({ id: "1", name: "Holiday picks", description: "" }),
      wl({ id: "2", name: "Other", description: "Books I want" }),
      wl({ id: "3", name: "Gear", description: null }),
    ];
    expect(filterWishlistsByQuery(list, "holiday").map((w) => w.id)).toEqual(["1"]);
    expect(filterWishlistsByQuery(list, "BOOKS").map((w) => w.id)).toEqual(["2"]);
    expect(filterWishlistsByQuery(list, "xyz").length).toBe(0);
  });
});
