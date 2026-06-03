"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, History, Lock, Pencil, Reply, Trash2, Unlock } from "lucide-react";
import {
  createBoardReply,
  deleteBoardReply,
  deleteBoardThread,
  fetchBoardByRef,
  fetchBoardFlairs,
  fetchBoardReplies,
  fetchBoardThread,
  patchBoardReply,
  patchBoardThread,
  patchBoardThreadLock,
  type Board,
  type BoardFlair,
  type BoardReply,
  type BoardThread,
} from "@/lib/api";
import { boardPath, boardThreadPath, isBoardUuid } from "@/lib/boardPaths";
import { formatRelativeTimeShort } from "@/lib/relativeTime";
import {
  type BoardReplySort,
  childReplies,
  countReplyDescendants,
  filterRepliesForSearch,
  sortRepliesChronologically,
  sortTopLevelReplies,
} from "@/lib/boardReplies";
import { BoardAuthorTags } from "@/components/boards/BoardAuthorTags";
import { BoardConfirmDeleteModal } from "@/components/boards/BoardConfirmDeleteModal";
import { BoardFlairBadge } from "@/components/boards/BoardFlairBadge";
import { BoardIcon } from "@/components/boards/BoardIcon";
import { BoardEditHistoryInline } from "@/components/boards/BoardEditHistoryInline";
import { BoardThreadFlairControl } from "@/components/boards/BoardThreadFlairControl";
import { MarkdownBody } from "@/components/MarkdownBody";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { useAuth } from "@/components/AuthProvider";

function ReplyItem({
  r,
  boardId,
  threadId,
  canPost,
  replyOpen,
  onReplyToggle,
  onDelete,
  onUpdated,
  mayViewHistory,
  branchOpen,
  onBranchToggle,
  descendantCount = 0,
}: {
  r: BoardReply;
  boardId: string;
  threadId: string;
  canPost?: boolean;
  replyOpen?: boolean;
  onReplyToggle?: () => void;
  onDelete?: (reply: BoardReply) => void;
  onUpdated?: (reply: BoardReply) => void;
  mayViewHistory?: boolean;
  branchOpen?: boolean;
  onBranchToggle?: () => void;
  descendantCount?: number;
}) {
  const collapsible = onBranchToggle != null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(r.body);
  const [busy, setBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const editFormRef = useRef<HTMLFormElement>(null);

  const showActions =
    collapsible ||
    canPost ||
    r.may_edit ||
    (r.may_delete && onDelete) ||
    mayViewHistory;

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEditErr(null);
    try {
      const updated = await patchBoardReply(boardId, threadId, r.id, draft.trim());
      onUpdated?.(updated);
      setEditing(false);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "Could not save reply.");
    } finally {
      setBusy(false);
    }
  }

  if (collapsible && branchOpen === false) {
    const authorName =
      r.author?.display_name?.trim() || r.author?.username?.trim() || `User #${r.user_id}`;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onBranchToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onBranchToggle();
          }
        }}
        aria-expanded={false}
        aria-label={
          descendantCount > 0
            ? `Expand reply by ${authorName} and ${descendantCount} nested ${descendantCount === 1 ? "reply" : "replies"}`
            : `Expand reply by ${authorName}`
        }
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-kurator-border bg-kurator-surface/60 px-3 py-2 text-left text-xs transition-colors hover:bg-kurator-border/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
      >
        <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-kurator-muted" aria-hidden />
        <span className="font-semibold text-kurator-fg">{authorName}</span>
        <BoardAuthorTags tags={r.author_tags} />
        <span className="text-kurator-muted">· {formatRelativeTimeShort(r.created_at)}</span>
        {descendantCount > 0 ? (
          <span className="text-kurator-muted">
            · {descendantCount} {descendantCount === 1 ? "reply" : "replies"}
          </span>
        ) : null}
        {r.is_edited ? <span className="text-kurator-muted">(edited)</span> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-kurator-border bg-kurator-surface/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {r.author ? (
            <ShelfAuthorLink author={r.author} variant="avatarAndUsername" />
          ) : (
            <span className="text-xs font-semibold text-kurator-muted">User #{r.user_id}</span>
          )}
          <BoardAuthorTags tags={r.author_tags} />
          <span className="text-xs text-kurator-muted">· {formatRelativeTimeShort(r.created_at)}</span>
        </div>
        {showActions && !editing ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {collapsible ? (
              <button
                type="button"
                onClick={onBranchToggle}
                aria-expanded={branchOpen !== false}
                aria-label={
                  descendantCount > 0
                    ? `Collapse reply and ${descendantCount} nested ${descendantCount === 1 ? "reply" : "replies"}`
                    : "Collapse reply"
                }
                className="rounded-lg p-1.5 text-kurator-muted transition-colors hover:bg-kurator-border/30 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {canPost && onReplyToggle ? (
              <button
                type="button"
                onClick={onReplyToggle}
                aria-label={replyOpen ? "Cancel reply" : "Reply"}
                aria-pressed={replyOpen}
                className={`rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent ${
                  replyOpen
                    ? "bg-kurator-accent/15 text-kurator-accent"
                    : "text-kurator-accent/90 hover:bg-kurator-accent/10 hover:text-kurator-accent"
                }`}
              >
                <Reply className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {r.may_edit ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(r.body);
                  setEditErr(null);
                  setEditing(true);
                }}
                aria-label="Edit reply"
                className="rounded-lg p-1.5 text-kurator-muted transition-colors hover:bg-kurator-border/30 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {mayViewHistory ? (
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-label={historyOpen ? "Hide edit history" : "Show edit history"}
                aria-expanded={historyOpen}
                className={`rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent ${
                  historyOpen
                    ? "bg-kurator-border/40 text-kurator-fg"
                    : "text-kurator-muted hover:bg-kurator-border/30 hover:text-kurator-fg"
                }`}
              >
                <History className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {r.may_delete && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(r)}
                aria-label="Delete reply"
                className="rounded-lg p-1.5 text-red-300/90 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing ? (
        <form ref={editFormRef} onSubmit={(e) => void saveEdit(e)} className="mt-2 space-y-2">
          <MarkdownRichEditor
            value={draft}
            onChange={setDraft}
            variant="compact"
            disabled={busy}
            aria-label="Edit reply"
            onSaveChord={() => editFormRef.current?.requestSubmit()}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || draft.trim() === ""}
              className="rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDraft(r.body);
                setEditErr(null);
              }}
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:bg-kurator-border/30 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {editErr ? (
            <p className="text-xs text-red-500" role="alert">
              {editErr}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="mt-2 text-sm">
          <MarkdownBody markdown={r.body} />
          {r.is_edited ? (
            <span className="ml-1 text-xs text-kurator-muted">(edited)</span>
          ) : null}
          {mayViewHistory ? (
            <BoardEditHistoryInline
              open={historyOpen}
              boardId={boardId}
              threadId={threadId}
              replyId={r.id}
              refreshKey={r.updated_at}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ReplyComposer({
  boardId,
  threadId,
  parentReplyId,
  onPosted,
  onCancel,
  compactLabel,
  embedded,
}: {
  boardId: string;
  threadId: string;
  parentReplyId?: string;
  onPosted: (reply: BoardReply) => void;
  onCancel?: () => void;
  compactLabel?: string;
  /** Omit outer chrome when nested inside ThreadReplyComposer. */
  embedded?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const rep = await createBoardReply(boardId, threadId, {
        body: draft.trim(),
        ...(parentReplyId ? { parent_reply_id: parentReplyId } : {}),
      });
      setDraft("");
      onPosted(rep);
      onCancel?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not post reply.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => void onSubmit(e)}
      className={
        embedded
          ? "space-y-2 p-3"
          : "space-y-2 rounded-xl border border-kurator-border bg-kurator-bg/40 p-3"
      }
    >
      {compactLabel ? <p className="text-xs text-kurator-muted">{compactLabel}</p> : null}
      <MarkdownRichEditor
        value={draft}
        onChange={setDraft}
        variant="compact"
        disabled={busy}
        placeholder="Write a reply…"
        aria-label={compactLabel ?? "Reply"}
        onSaveChord={() => formRef.current?.requestSubmit()}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || draft.trim() === ""}
          className="rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Posting…" : "Reply"}
        </button>
        {onCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:bg-kurator-border/30 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {err ? (
        <p className="text-xs text-red-500" role="alert">
          {err}
        </p>
      ) : null}
    </form>
  );
}

function ThreadReplyComposer({
  boardId,
  threadId,
  onPosted,
}: {
  boardId: string;
  threadId: string;
  onPosted: (reply: BoardReply) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-kurator-border bg-kurator-bg/40">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-controls="thread-reply-composer"
          className="flex w-full items-center px-3 py-2.5 text-left text-sm text-kurator-muted transition-colors hover:bg-kurator-border/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kurator-accent"
        >
          Write a reply…
        </button>
      ) : null}
      <div
        id="thread-reply-composer"
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {expanded ? (
            <ReplyComposer
              embedded
              boardId={boardId}
              threadId={threadId}
              onPosted={(rep) => {
                onPosted(rep);
                setExpanded(false);
              }}
              onCancel={() => setExpanded(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReplyBranch({
  reply,
  boardId,
  threadId,
  allReplies,
  canPost,
  mayViewHistory,
  isTopLevel = false,
  onDelete,
  onPosted,
  onUpdated,
}: {
  reply: BoardReply;
  boardId: string;
  threadId: string;
  allReplies: BoardReply[];
  canPost: boolean;
  mayViewHistory?: boolean;
  isTopLevel?: boolean;
  onDelete: (reply: BoardReply) => void;
  onPosted: (reply: BoardReply) => void;
  onUpdated: (reply: BoardReply) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(true);
  const children = sortRepliesChronologically(childReplies(allReplies, reply.id));
  const descendantCount = countReplyDescendants(allReplies, reply.id);
  const canCollapseBranch = isTopLevel || descendantCount > 0;
  const authorLabel =
    reply.author?.display_name?.trim() ||
    reply.author?.username?.trim() ||
    `User #${reply.user_id}`;

  return (
    <li className="space-y-2">
      <ReplyItem
        r={reply}
        boardId={boardId}
        threadId={threadId}
        canPost={canPost}
        replyOpen={replyOpen}
        onReplyToggle={() => setReplyOpen((open) => !open)}
        onDelete={onDelete}
        onUpdated={onUpdated}
        mayViewHistory={mayViewHistory}
        branchOpen={branchOpen}
        onBranchToggle={canCollapseBranch ? () => setBranchOpen((open) => !open) : undefined}
        descendantCount={descendantCount}
      />
      {branchOpen ? (
        <>
          {replyOpen && canPost ? (
            <ReplyComposer
              boardId={boardId}
              threadId={threadId}
              parentReplyId={reply.id}
              compactLabel={`Replying to ${authorLabel}`}
              onPosted={onPosted}
              onCancel={() => setReplyOpen(false)}
            />
          ) : null}
          {children.length > 0 ? (
            <ul className="ml-3 space-y-2 border-l border-kurator-border/50 pl-3 md:ml-4 md:pl-4">
              {children.map((child) => (
                <ReplyBranch
                  key={child.id}
                  reply={child}
                  boardId={boardId}
                  threadId={threadId}
                  allReplies={allReplies}
                  canPost={canPost}
                  mayViewHistory={mayViewHistory}
                  onDelete={onDelete}
                  onPosted={onPosted}
                  onUpdated={onUpdated}
                />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function BoardThreadClient() {
  const params = useParams();
  const boardParam = params.slug ?? params.id;
  const boardRef =
    typeof boardParam === "string" ? decodeURIComponent(boardParam.trim()) : "";
  const threadId = typeof params.threadId === "string" ? params.threadId : "";
  const router = useRouter();
  const { user } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [thread, setThread] = useState<BoardThread | null>(null);
  const [flairs, setFlairs] = useState<BoardFlair[]>([]);
  const [replies, setReplies] = useState<BoardReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replyToDelete, setReplyToDelete] = useState<BoardReply | null>(null);
  const [threadEditing, setThreadEditing] = useState(false);
  const [threadTitleDraft, setThreadTitleDraft] = useState("");
  const [threadBodyDraft, setThreadBodyDraft] = useState("");
  const [threadEditBusy, setThreadEditBusy] = useState(false);
  const [threadEditErr, setThreadEditErr] = useState<string | null>(null);
  const [threadHistoryOpen, setThreadHistoryOpen] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [replySearch, setReplySearch] = useState("");
  const [replySort, setReplySort] = useState<BoardReplySort>("oldest");
  const threadEditFormRef = useRef<HTMLFormElement>(null);

  function onReplyPosted(rep: BoardReply) {
    setReplies((prev) => [...prev, rep]);
    setThread((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
    setErr(null);
  }

  function onReplyUpdated(updated: BoardReply) {
    setReplies((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setErr(null);
  }

  async function toggleThreadLock() {
    if (!board || !thread) return;
    setLockBusy(true);
    setErr(null);
    try {
      const updated = await patchBoardThreadLock(board.id, thread.id, !thread.is_locked);
      setThread(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update thread lock.");
    } finally {
      setLockBusy(false);
    }
  }

  async function saveThreadEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!board || !thread) return;
    setThreadEditBusy(true);
    setThreadEditErr(null);
    try {
      const updated = await patchBoardThread(board.id, thread.id, {
        title: threadTitleDraft.trim(),
        body: threadBodyDraft.trim(),
      });
      setThread(updated);
      setThreadEditing(false);
    } catch (e) {
      setThreadEditErr(e instanceof Error ? e.message : "Could not save thread.");
    } finally {
      setThreadEditBusy(false);
    }
  }

  const load = useCallback(async () => {
    if (!boardRef || !threadId) return;
    setLoading(true);
    setErr(null);
    try {
      const b = await fetchBoardByRef(boardRef);
      if (isBoardUuid(boardRef)) {
        router.replace(boardThreadPath(b.slug, threadId));
        return;
      }
      const [t, r, f] = await Promise.all([
        fetchBoardThread(b.id, threadId),
        fetchBoardReplies(b.id, threadId),
        fetchBoardFlairs(b.id),
      ]);
      setBoard(b);
      setThread(t);
      setReplies(r);
      setFlairs(f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load thread.");
    } finally {
      setLoading(false);
    }
  }, [boardRef, threadId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayReplies = useMemo(
    () => filterRepliesForSearch(replies, replySearch),
    [replies, replySearch],
  );
  const sortedRoots = useMemo(
    () => sortTopLevelReplies(displayReplies, replySort),
    [displayReplies, replySort],
  );
  const replySearchActive = replySearch.trim().length > 0;

  if (loading) {
    return <p className="text-sm text-kurator-muted">Loading…</p>;
  }
  if (err && !thread) {
    return (
      <div>
        <p className="text-sm text-red-500">{err}</p>
        <Link
          href={boardRef ? boardPath(boardRef) : "/boards"}
          className="mt-4 inline-block text-sm text-kurator-accent"
        >
          Back to board
        </Link>
      </div>
    );
  }
  if (!board || !thread) return null;

  const canPost = Boolean(board.may_post && user);
  const canReply = canPost && !thread.is_locked;

  return (
    <div>
      <nav className="mb-4 text-sm text-kurator-muted">
        <Link href="/boards" className="hover:text-kurator-fg">
          Boards
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={boardPath(board.slug)}
          className="inline-flex items-center gap-1.5 hover:text-kurator-fg"
        >
          <BoardIcon iconUrl={board.icon_url} name={board.name} className="h-5 w-5" />
          <span>{board.name}</span>
        </Link>
        <span className="mx-2">/</span>
        <span className="text-kurator-fg line-clamp-1">{thread.title}</span>
      </nav>
      <article className="rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 shadow-surface">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {!threadEditing ? (
                <h1 className="text-xl font-semibold text-kurator-fg">{thread.title}</h1>
              ) : (
                <span className="text-sm font-medium text-kurator-muted">Editing thread</span>
              )}
              {thread.flair_label && !thread.may_set_flair && !threadEditing ? (
                <BoardFlairBadge label={thread.flair_label} />
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {thread.author ? (
                <ShelfAuthorLink author={thread.author} variant="avatarAndName" />
              ) : (
                <span className="text-xs text-kurator-muted">User #{thread.user_id}</span>
              )}
              <BoardAuthorTags tags={thread.author_tags} />
              <span className="text-xs text-kurator-muted">
                · {formatRelativeTimeShort(thread.created_at)}
              </span>
            </div>
          </div>
          {(thread.may_edit ||
            thread.may_delete ||
            thread.may_lock ||
            thread.may_view_history) &&
          !threadEditing ? (
            <div className="flex shrink-0 items-center gap-0.5">
              {thread.may_view_history ? (
                <button
                  type="button"
                  onClick={() => setThreadHistoryOpen((v) => !v)}
                  aria-label={threadHistoryOpen ? "Hide edit history" : "Show edit history"}
                  aria-expanded={threadHistoryOpen}
                  className={`rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent ${
                    threadHistoryOpen
                      ? "bg-kurator-border/40 text-kurator-fg"
                      : "text-kurator-muted hover:bg-kurator-border/30 hover:text-kurator-fg"
                  }`}
                >
                  <History className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              {thread.may_lock ? (
                <button
                  type="button"
                  onClick={() => void toggleThreadLock()}
                  disabled={lockBusy}
                  aria-label={thread.is_locked ? "Unlock thread" : "Lock thread"}
                  className="rounded-lg p-1.5 text-kurator-muted transition-colors hover:bg-kurator-border/30 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent disabled:opacity-50"
                >
                  {thread.is_locked ? (
                    <Unlock className="h-4 w-4" aria-hidden />
                  ) : (
                    <Lock className="h-4 w-4" aria-hidden />
                  )}
                </button>
              ) : null}
              {thread.may_edit ? (
                <button
                  type="button"
                  onClick={() => {
                    setThreadTitleDraft(thread.title);
                    setThreadBodyDraft(thread.body);
                    setThreadEditErr(null);
                    setThreadEditing(true);
                  }}
                  aria-label="Edit thread"
                  className="rounded-lg p-1.5 text-kurator-muted transition-colors hover:bg-kurator-border/30 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              {thread.may_delete ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Delete thread"
                  className="rounded-lg p-1.5 text-red-300/90 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!threadEditing ? (
          <div className="mt-3">
            <BoardThreadFlairControl
              boardId={board.id}
              thread={thread}
              flairs={flairs}
              onUpdated={setThread}
            />
          </div>
        ) : null}
        {threadEditing ? (
          <form
            ref={threadEditFormRef}
            onSubmit={(e) => void saveThreadEdit(e)}
            className="mt-4 space-y-3"
          >
            <input
              type="text"
              value={threadTitleDraft}
              onChange={(e) => setThreadTitleDraft(e.target.value)}
              required
              maxLength={200}
              disabled={threadEditBusy}
              className="w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-lg font-semibold text-kurator-fg"
              aria-label="Thread title"
            />
            <MarkdownRichEditor
              value={threadBodyDraft}
              onChange={setThreadBodyDraft}
              variant="full"
              allowImages
              disabled={threadEditBusy}
              aria-label="Thread body"
              onSaveChord={() => threadEditFormRef.current?.requestSubmit()}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={threadEditBusy || threadBodyDraft.trim() === "" || threadTitleDraft.trim() === ""}
                className="rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
              >
                {threadEditBusy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={threadEditBusy}
                onClick={() => {
                  setThreadEditing(false);
                  setThreadEditErr(null);
                }}
                className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:bg-kurator-border/30 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {threadEditErr ? (
              <p className="text-sm text-red-500" role="alert">
                {threadEditErr}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="mt-4">
            <MarkdownBody markdown={thread.body} />
            {thread.may_view_history ? (
              <BoardEditHistoryInline
                open={threadHistoryOpen}
                boardId={board.id}
                threadId={thread.id}
                refreshKey={thread.updated_at}
              />
            ) : null}
          </div>
        )}
      </article>
      <div className="mb-4 mt-2 flex items-center gap-2 pl-3 text-sm font-medium text-kurator-muted">
        <Reply className="h-5 w-5" aria-hidden />
        <span>{thread.reply_count}</span>
        <span className="sr-only">replies</span>
      </div>
      {thread.is_locked ? (
        <p
          className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90"
          role="status"
        >
          This thread is locked. No new replies can be posted.
        </p>
      ) : null}
      {canReply ? (
        <ThreadReplyComposer
          boardId={board.id}
          threadId={thread.id}
          onPosted={onReplyPosted}
        />
      ) : !user ? (
        <p className="mb-4 text-sm text-kurator-muted">
          <Link
            href={`/login?next=${encodeURIComponent(boardThreadPath(board.slug, thread.id))}`}
            className="text-kurator-accent hover:underline"
          >
            Sign in
          </Link>{" "}
          to reply.
        </p>
      ) : canPost && thread.is_locked ? (
        <p className="mb-4 text-sm text-kurator-muted">This thread is locked.</p>
      ) : null}
      <section className="mb-12">
        {replies.length > 0 ? (
          <div className="mb-4 flex w-full max-w-[40%] min-w-[min(100%,16rem)] flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              type="search"
              value={replySearch}
              onChange={(e) => setReplySearch(e.target.value)}
              placeholder="Search by text or author…"
              aria-label="Search replies"
              className="min-w-0 flex-1 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <span className="whitespace-nowrap text-kurator-muted">Sort by</span>
              <select
                value={replySort}
                onChange={(e) => setReplySort(e.target.value as BoardReplySort)}
                aria-label="Sort replies"
                className="min-w-[9rem] rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              >
                <option value="oldest">Oldest first</option>
                <option value="newest">Newest first</option>
                <option value="most_replied">Most replies</option>
              </select>
            </div>
          </div>
        ) : null}
        {replySearchActive && sortedRoots.length === 0 ? (
          <p className="text-sm text-kurator-muted">No replies match your search.</p>
        ) : (
          <ul className="space-y-3">
            {sortedRoots.map((r) => (
              <ReplyBranch
                key={r.id}
                reply={r}
                boardId={board.id}
                threadId={thread.id}
                allReplies={displayReplies}
                canPost={canReply}
                isTopLevel
                mayViewHistory={thread.may_view_history}
                onDelete={setReplyToDelete}
                onPosted={onReplyPosted}
                onUpdated={onReplyUpdated}
              />
            ))}
          </ul>
        )}
        {err ? <p className="mt-4 text-sm text-red-500">{err}</p> : null}
      </section>
      <BoardConfirmDeleteModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete thread?"
        description={`Permanently delete “${thread.title}” and all replies. This cannot be undone.`}
        onConfirm={async () => {
          await deleteBoardThread(board.id, thread.id);
          router.push(boardPath(board.slug));
        }}
      />
      <BoardConfirmDeleteModal
        open={replyToDelete != null}
        onOpenChange={(open) => {
          if (!open) setReplyToDelete(null);
        }}
        title="Delete reply?"
        description="Permanently delete this reply. This cannot be undone."
        onConfirm={async () => {
          if (!replyToDelete) return;
          await deleteBoardReply(board.id, thread.id, replyToDelete.id);
          const [r, t] = await Promise.all([
            fetchBoardReplies(board.id, thread.id),
            fetchBoardThread(board.id, thread.id),
          ]);
          setReplies(r);
          setThread(t);
          setReplyToDelete(null);
        }}
      />
    </div>
  );
}
