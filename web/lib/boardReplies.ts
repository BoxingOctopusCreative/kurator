import type { BoardReply } from "@/lib/api";

export type BoardReplySort = "oldest" | "newest" | "most_replied";

function replyCreatedAtMs(r: BoardReply): number {
  const ms = Date.parse(r.created_at);
  return Number.isFinite(ms) ? ms : 0;
}

function replyMatchesSearch(r: BoardReply, query: string): boolean {
  const body = r.body.toLowerCase();
  const username = r.author?.username?.toLowerCase() ?? "";
  const displayName = r.author?.display_name?.toLowerCase() ?? "";
  return body.includes(query) || username.includes(query) || displayName.includes(query);
}

/** Group replies by parent id (`null` = top-level reply to the thread). */
export function groupRepliesByParent(replies: BoardReply[]): Map<string | null, BoardReply[]> {
  const map = new Map<string | null, BoardReply[]>();
  for (const reply of replies) {
    const key = reply.parent_reply_id ?? null;
    const list = map.get(key);
    if (list) list.push(reply);
    else map.set(key, [reply]);
  }
  return map;
}

export function topLevelReplies(replies: BoardReply[]): BoardReply[] {
  return groupRepliesByParent(replies).get(null) ?? [];
}

export function childReplies(replies: BoardReply[], parentId: string): BoardReply[] {
  return groupRepliesByParent(replies).get(parentId) ?? [];
}

/** Total replies in the subtree rooted at `parentId` (not including the parent itself). */
export function countReplyDescendants(replies: BoardReply[], parentId: string): number {
  const direct = childReplies(replies, parentId);
  return direct.reduce((sum, r) => sum + 1 + countReplyDescendants(replies, r.id), 0);
}

/** Keep matches plus ancestor and descendant context so trees stay readable. */
export function filterRepliesForSearch(replies: BoardReply[], query: string): BoardReply[] {
  const q = query.trim().toLowerCase();
  if (!q) return replies;

  const byId = new Map(replies.map((r) => [r.id, r]));
  const visible = new Set<string>();

  function addDescendants(parentId: string) {
    for (const r of replies) {
      if (r.parent_reply_id === parentId) {
        visible.add(r.id);
        addDescendants(r.id);
      }
    }
  }

  for (const r of replies) {
    if (!replyMatchesSearch(r, q)) continue;
    visible.add(r.id);
    let parentId = r.parent_reply_id;
    while (parentId) {
      visible.add(parentId);
      parentId = byId.get(parentId)?.parent_reply_id ?? undefined;
    }
    addDescendants(r.id);
  }

  return replies.filter((r) => visible.has(r.id));
}

export function sortTopLevelReplies(replies: BoardReply[], sort: BoardReplySort): BoardReply[] {
  const roots = [...topLevelReplies(replies)];
  if (sort === "newest") {
    roots.sort((a, b) => replyCreatedAtMs(b) - replyCreatedAtMs(a));
  } else if (sort === "most_replied") {
    roots.sort(
      (a, b) => countReplyDescendants(replies, b.id) - countReplyDescendants(replies, a.id),
    );
  } else {
    roots.sort((a, b) => replyCreatedAtMs(a) - replyCreatedAtMs(b));
  }
  return roots;
}

export function sortRepliesChronologically(replies: BoardReply[]): BoardReply[] {
  return [...replies].sort((a, b) => replyCreatedAtMs(a) - replyCreatedAtMs(b));
}
