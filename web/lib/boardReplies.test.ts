import { describe, expect, it } from "vitest";
import {
  childReplies,
  countReplyDescendants,
  filterRepliesForSearch,
  groupRepliesByParent,
  sortTopLevelReplies,
  topLevelReplies,
} from "@/lib/boardReplies";
import type { BoardReply } from "@/lib/api";

function reply(id: string, parent?: string): BoardReply {
  return {
    id,
    thread_id: "t1",
    user_id: 1,
    body: id,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...(parent ? { parent_reply_id: parent } : {}),
  };
}

describe("boardReplies", () => {
  it("groups nested replies at any depth", () => {
    const replies = [reply("a"), reply("b", "a"), reply("c", "b"), reply("d", "c")];
    expect(topLevelReplies(replies).map((r) => r.id)).toEqual(["a"]);
    expect(childReplies(replies, "a").map((r) => r.id)).toEqual(["b"]);
    expect(childReplies(replies, "b").map((r) => r.id)).toEqual(["c"]);
    expect(childReplies(replies, "c").map((r) => r.id)).toEqual(["d"]);
    expect(groupRepliesByParent(replies).get("d") ?? []).toEqual([]);
  });

  it("counts all descendants in a subtree", () => {
    const replies = [reply("a"), reply("b", "a"), reply("c", "b"), reply("d", "c")];
    expect(countReplyDescendants(replies, "a")).toBe(3);
    expect(countReplyDescendants(replies, "b")).toBe(2);
    expect(countReplyDescendants(replies, "d")).toBe(0);
  });

  it("sorts top-level replies", () => {
    const replies = [
      { ...reply("a"), created_at: "2026-01-03T00:00:00Z" },
      { ...reply("b"), created_at: "2026-01-01T00:00:00Z" },
      { ...reply("c"), created_at: "2026-01-02T00:00:00Z" },
      reply("d", "a"),
    ];
    expect(sortTopLevelReplies(replies, "oldest").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortTopLevelReplies(replies, "newest").map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(sortTopLevelReplies(replies, "most_replied").map((r) => r.id)[0]).toBe("a");
  });

  it("filters replies by search with tree context", () => {
    const replies = [
      { ...reply("a"), body: "hello thread" },
      { ...reply("b", "a"), body: "nested noise" },
      { ...reply("c", "b"), body: "needle here" },
      { ...reply("d"), body: "other root" },
    ];
    const filtered = filterRepliesForSearch(replies, "needle");
    expect(filtered.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });
});
