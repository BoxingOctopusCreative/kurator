import { describe, expect, it } from "vitest";
import {
  parseCollectionsListRecord,
  parseCollectionsListSearchString,
  stringifyCollectionsListFilters,
} from "./collectionsListUrl";

describe("collectionsListUrl", () => {
  it("parses record defaults", () => {
    expect(parseCollectionsListRecord({})).toEqual({
      q: "",
      page: 1,
      sort: "name_asc",
      scope: "all",
    });
  });

  it("stringify omits defaults and parse round-trips", () => {
    const f = parseCollectionsListRecord({
      q: "  jazz  ",
      page: "2",
      sort: "items_desc",
      scope: "following",
    });
    expect(f.q).toBe("  jazz  ");
    expect(f.page).toBe(2);
    const qs = stringifyCollectionsListFilters({ ...f, q: f.q.trim() });
    const back = parseCollectionsListSearchString(`?${qs}`);
    expect(back.q).toBe("jazz");
    expect(back.page).toBe(2);
    expect(back.sort).toBe("items_desc");
    expect(back.scope).toBe("following");
  });
});
