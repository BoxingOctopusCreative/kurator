import { describe, expect, it } from "vitest";
import type { Collection, List } from "./api";
import {
  filterCollectionListForUserProfile,
  filterListsForUserProfile,
  shelfIsPublicOnUserProfile,
  shelfOwnedByProfileUser,
} from "./profilePublicShelves";

describe("shelfOwnedByProfileUser", () => {
  it("matches owner id", () => {
    expect(shelfOwnedByProfileUser({ user_id: 5 }, 5)).toBe(true);
    expect(shelfOwnedByProfileUser({ user_id: 5 }, 99)).toBe(false);
  });

  it("rejects missing user_id", () => {
    expect(shelfOwnedByProfileUser({}, 5)).toBe(false);
    expect(shelfOwnedByProfileUser({ user_id: null }, 5)).toBe(false);
  });
});

describe("shelfIsPublicOnUserProfile", () => {
  it("excludes private non-shared shelves", () => {
    expect(shelfIsPublicOnUserProfile({ visibility: "private", is_shared: false })).toBe(false);
    expect(shelfIsPublicOnUserProfile({ is_public: false, is_shared: false })).toBe(false);
  });

  it("includes followers or friends visibility", () => {
    expect(shelfIsPublicOnUserProfile({ visibility: "followers", is_shared: false })).toBe(true);
    expect(shelfIsPublicOnUserProfile({ visibility: "friends", is_shared: false })).toBe(true);
    expect(shelfIsPublicOnUserProfile({ is_public: true, is_shared: false })).toBe(true);
  });

  it("includes private shelves when shared", () => {
    expect(shelfIsPublicOnUserProfile({ visibility: "private", is_shared: true })).toBe(true);
  });
});

describe("filterCollectionListForUserProfile", () => {
  it("keeps only this owner’s public-profile shelves", () => {
    const out = filterCollectionListForUserProfile(
      {
        items: [
          {
            id: "a",
            user_id: 1,
            name: "Pub",
            is_public: true,
            item_count: 1,
            created_at: "",
            updated_at: "",
          } as Collection,
          {
            id: "b",
            user_id: 1,
            name: "Priv",
            visibility: "private",
            is_public: false,
            item_count: 0,
            created_at: "",
            updated_at: "",
          } as Collection,
          {
            id: "c",
            user_id: 2,
            name: "Someone else",
            is_public: true,
            item_count: 0,
            created_at: "",
            updated_at: "",
          } as Collection,
        ],
        total: 3,
        page: 1,
        page_size: 48,
      },
      1,
    );
    expect(out.items.map((c) => c.id)).toEqual(["a"]);
    expect(out.total).toBe(1);
  });
});

describe("filterListsForUserProfile", () => {
  it("filters lists", () => {
    const lists: List[] = [
      { id: "1", user_id: 1, name: "A", is_public: true, item_count: 0, created_at: "", updated_at: "" },
      {
        id: "2",
        user_id: 1,
        name: "B",
        visibility: "private",
        is_public: false,
        item_count: 0,
        created_at: "",
        updated_at: "",
      },
    ];
    expect(filterListsForUserProfile(lists, 1).map((l) => l.id)).toEqual(["1"]);
  });

  it("drops lists owned by another user", () => {
    const lists: List[] = [
      { id: "1", user_id: 1, name: "Mine", is_public: true, item_count: 0, created_at: "", updated_at: "" },
      { id: "2", user_id: 99, name: "Theirs", is_public: true, item_count: 0, created_at: "", updated_at: "" },
    ];
    expect(filterListsForUserProfile(lists, 1).map((l) => l.id)).toEqual(["1"]);
  });
});
