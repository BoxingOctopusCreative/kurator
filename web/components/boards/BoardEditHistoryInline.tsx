"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  fetchBoardReplyEdits,
  fetchBoardThreadEdits,
  type BoardReplyEdit,
  type BoardThreadEdit,
} from "@/lib/api";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import type { ShelfAuthor } from "@/lib/api";

type Props = {
  open: boolean;
  boardId: string;
  threadId: string;
  replyId?: string;
  /** Bumps when content is saved so history refetches while open. */
  refreshKey?: string;
};

export function BoardEditHistoryInline({ open, boardId, threadId, replyId, refreshKey }: Props) {
  const [threadEdits, setThreadEdits] = useState<BoardThreadEdit[] | null>(null);
  const [replyEdits, setReplyEdits] = useState<BoardReplyEdit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        if (replyId) {
          const edits = await fetchBoardReplyEdits(boardId, threadId, replyId);
          if (!cancelled) setReplyEdits(edits);
        } else {
          const edits = await fetchBoardThreadEdits(boardId, threadId);
          if (!cancelled) setThreadEdits(edits);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load edit history.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, boardId, threadId, replyId, refreshKey]);

  if (!open) {
    return null;
  }

  const edits = replyId ? replyEdits : threadEdits;

  if (loading && edits === null) {
    return <p className="mt-3 text-xs text-kurator-muted">Loading edit history…</p>;
  }

  if (err) {
    return (
      <p className="mt-3 text-xs text-red-500" role="alert">
        {err}
      </p>
    );
  }

  if (edits && edits.length === 0) {
    return <p className="mt-3 text-xs text-kurator-muted">No prior versions recorded yet.</p>;
  }

  if (!edits?.length) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 border-t border-kurator-border/60 pt-4">
      {replyId
        ? replyEdits!.map((e) => (
            <EditBlock key={e.id} editor={e.editor} editorUserId={e.editor_user_id} createdAt={e.created_at}>
              <MarkdownBody markdown={e.body} />
            </EditBlock>
          ))
        : threadEdits!.map((e) => (
            <EditBlock key={e.id} editor={e.editor} editorUserId={e.editor_user_id} createdAt={e.created_at}>
              <p className="mb-2 font-medium text-kurator-fg/80">{e.title}</p>
              <MarkdownBody markdown={e.body} />
            </EditBlock>
          ))}
    </div>
  );
}

function EditBlock({
  editor,
  editorUserId,
  createdAt,
  children,
}: {
  editor?: ShelfAuthor;
  editorUserId: number;
  createdAt: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-kurator-border/50 bg-kurator-bg/30 px-3 py-2.5 text-sm text-kurator-muted">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium text-kurator-muted">Previous version</span>
        <span aria-hidden>·</span>
        {editor ? (
          <ShelfAuthorLink author={editor} variant="avatarAndUsername" />
        ) : (
          <span>User #{editorUserId}</span>
        )}
        <span aria-hidden>·</span>
        <time dateTime={createdAt}>{new Date(createdAt).toLocaleString()}</time>
      </div>
      <div className="text-kurator-fg/75">{children}</div>
    </div>
  );
}
