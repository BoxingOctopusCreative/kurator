"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  createBoardThread,
  deleteBoard,
  deleteBoardThread,
  fetchBoardByRef,
  fetchBoardFlairs,
  fetchBoardThreads,
  inviteToBoard,
  fetchMyFriends,
  type Board,
  type BoardFlair,
  type BoardThread,
  type PublicUser,
} from "@/lib/api";
import { boardPath, boardThreadPath, isBoardUuid } from "@/lib/boardPaths";
import { formatRelativeTimeShort } from "@/lib/relativeTime";
import { BoardSettingsModal } from "@/components/boards/BoardSettingsModal";
import { BoardConfirmDeleteModal } from "@/components/boards/BoardConfirmDeleteModal";
import { BoardFlairBadge } from "@/components/boards/BoardFlairBadge";
import { BoardIcon } from "@/components/boards/BoardIcon";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { MarkdownBody } from "@/components/MarkdownBody";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import { KuratorModal } from "@/components/KuratorModal";
import { FriendCheckboxRow } from "@/components/FriendCheckboxRow";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { useAuth } from "@/components/AuthProvider";

export function BoardDetailClient() {
  const params = useParams();
  const boardParam = params.slug ?? params.id;
  const boardRef =
    typeof boardParam === "string" ? decodeURIComponent(boardParam.trim()) : "";
  const { user } = useAuth();
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [threads, setThreads] = useState<BoardThread[]>([]);
  const [flairs, setFlairs] = useState<BoardFlair[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadBody, setThreadBody] = useState("");
  const [threadBusy, setThreadBusy] = useState(false);
  const threadFormRef = useRef<HTMLFormElement>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [inviteIds, setInviteIds] = useState<Set<number>>(() => new Set());
  const [inviteBusy, setInviteBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteBoardOpen, setDeleteBoardOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<BoardThread | null>(null);

  const load = useCallback(async () => {
    if (!boardRef) return;
    setLoading(true);
    setErr(null);
    try {
      const b = await fetchBoardByRef(boardRef);
      if (isBoardUuid(boardRef)) {
        router.replace(boardPath(b.slug));
        return;
      }
      const [t, f] = await Promise.all([fetchBoardThreads(b.id), fetchBoardFlairs(b.id)]);
      setBoard(b);
      setThreads(t);
      setFlairs(f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load board.");
    } finally {
      setLoading(false);
    }
  }, [boardRef, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!inviteOpen || !user) return;
    let cancelled = false;
    fetchMyFriends({ limit: 200 })
      .then((r) => {
        if (!cancelled) setFriends(r.items);
      })
      .catch(() => {
        if (!cancelled) setFriends([]);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteOpen, user]);

  async function submitThread(e: React.FormEvent) {
    e.preventDefault();
    if (!board) return;
    setThreadBusy(true);
    try {
      const t = await createBoardThread(board.id, {
        title: threadTitle.trim(),
        body: threadBody.trim(),
      });
      setNewOpen(false);
      setThreadTitle("");
      setThreadBody("");
      router.push(boardThreadPath(board.slug, t.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create thread.");
    } finally {
      setThreadBusy(false);
    }
  }

  async function submitInvites() {
    if (!board) return;
    setInviteBusy(true);
    try {
      await inviteToBoard(board.id, Array.from(inviteIds));
      setInviteOpen(false);
      setInviteIds(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send invites.");
    } finally {
      setInviteBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-kurator-muted">Loading…</p>;
  }
  if (err && !board) {
    return (
      <div>
        <p className="text-sm text-red-500">{err}</p>
        <Link href="/boards" className="mt-4 inline-block text-sm text-kurator-accent hover:underline">
          Back to Boards
        </Link>
      </div>
    );
  }
  if (!board) return null;

  return (
    <div>
      <PageHeroUnsplash
        bleedBottomMargin={false}
        bleedToMainTop
        customBackgroundUrl={(board.banner_url ?? "").trim() || null}
      >
        <nav className="mb-4 text-sm text-kurator-muted">
          <Link href="/boards" className="hover:text-kurator-fg">
            Boards
          </Link>
          <span className="mx-2">/</span>
          <span className="text-kurator-fg">{board.name}</span>
        </nav>
        <header className="mb-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <BoardIcon iconUrl={board.icon_url} name={board.name} className="h-16 w-16 sm:h-20 sm:w-20" />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold tracking-tight text-kurator-fg">{board.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-kurator-muted">
                <span>{board.visibility === "private" ? "Private board" : "Public board"}</span>
                {board.owner?.username ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span>by</span>
                      <ShelfAuthorLink author={board.owner} variant="avatarAndName" />
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          {board.description ? (
            <div className="mt-4 rounded-xl border border-kurator-border/80 bg-kurator-bg/60 p-4 backdrop-blur-sm">
              <MarkdownBody markdown={board.description} />
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {board.may_manage ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg border border-kurator-border bg-kurator-bg/80 px-3 py-1.5 text-sm text-kurator-muted hover:bg-kurator-border/30"
              >
                Settings
              </button>
            ) : null}
            {board.may_manage && board.visibility === "private" ? (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="rounded-lg border border-kurator-border bg-kurator-bg/80 px-3 py-1.5 text-sm text-kurator-muted hover:bg-kurator-border/30"
              >
                Invite Friends
              </button>
            ) : null}
            {board.may_manage ? (
              <button
                type="button"
                onClick={() => setDeleteBoardOpen(true)}
                aria-label="Delete board"
                className="rounded-lg border border-red-500/40 bg-kurator-bg/80 p-2 text-red-300/90 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {board.may_post && user ? (
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90"
              >
                New Thread
              </button>
            ) : !user ? (
              <Link
                href={`/login?next=${encodeURIComponent(boardPath(board.slug))}`}
                className="rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90"
              >
                Sign in to post
              </Link>
            ) : null}
          </div>
        </header>
      </PageHeroUnsplash>
      {err ? <p className="mt-8 mb-4 text-sm text-red-500">{err}</p> : null}
      <section className="mt-8 md:mt-10">
        <h2 className="mb-3 text-xl font-semibold tracking-tight text-kurator-fg md:text-2xl">
          Threads
        </h2>
        {threads.length === 0 ? (
          <p className="text-sm text-kurator-muted">No threads yet.</p>
        ) : (
          <ul className="space-y-2">
            {threads.map((t) => (
              <li
                key={t.id}
                className="flex items-stretch gap-2 rounded-xl border border-kurator-border bg-kurator-surface/60 shadow-surface transition-colors hover:border-kurator-accent/50"
              >
                <div className="min-w-0 flex-1 px-4 py-3">
                  <Link href={boardThreadPath(board.slug, t.id)} className="block">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-kurator-fg">{t.title}</h3>
                      {t.flair_label ? <BoardFlairBadge label={t.flair_label} /> : null}
                    </div>
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kurator-muted">
                    {t.author ? (
                      <ShelfAuthorLink author={t.author} variant="avatarAndName" />
                    ) : (
                      <span>User #{t.user_id}</span>
                    )}
                    <span aria-hidden>·</span>
                    <span>
                      {t.reply_count} repl{t.reply_count === 1 ? "y" : "ies"}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{formatRelativeTimeShort(t.created_at)}</span>
                  </div>
                </div>
                {t.may_delete ? (
                  <button
                    type="button"
                    onClick={() => setThreadToDelete(t)}
                    aria-label={`Delete thread ${t.title}`}
                    className="shrink-0 self-center rounded-lg p-2 text-red-300/90 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <KuratorModal
        open={newOpen}
        onOpenChange={setNewOpen}
        title="New Thread"
        panelClassName="max-w-2xl w-[min(100%,42rem)]"
      >
        <form ref={threadFormRef} onSubmit={(e) => void submitThread(e)} className="space-y-3">
          <input
            type="text"
            value={threadTitle}
            onChange={(e) => setThreadTitle(e.target.value)}
            placeholder="Title"
            required
            maxLength={200}
            className="w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-kurator-fg"
          />
          <MarkdownRichEditor
            value={threadBody}
            onChange={setThreadBody}
            variant="full"
            allowImages
            disabled={threadBusy}
            placeholder="Write your post… Markdown, links, and images supported."
            aria-label="Thread body"
            onSaveChord={() => threadFormRef.current?.requestSubmit()}
          />
          <button
            type="submit"
            disabled={threadBusy || threadBody.trim() === ""}
            className="rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {threadBusy ? "Posting…" : "Post Thread"}
          </button>
        </form>
      </KuratorModal>
      {board.may_manage ? (
        <BoardSettingsModal
          board={board}
          flairs={flairs}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onSaved={(b) => {
            setBoard(b);
            void load();
          }}
          onFlairsChange={() => void load()}
          onSlugChanged={(newSlug) => {
            router.replace(boardPath(newSlug));
          }}
        />
      ) : null}
      <BoardConfirmDeleteModal
        open={deleteBoardOpen}
        onOpenChange={setDeleteBoardOpen}
        title="Delete board?"
        description={`Permanently delete “${board.name}” and all of its threads and replies. This cannot be undone.`}
        onConfirm={async () => {
          await deleteBoard(board.id);
          router.push("/boards");
        }}
      />
      <BoardConfirmDeleteModal
        open={threadToDelete != null}
        onOpenChange={(open) => {
          if (!open) setThreadToDelete(null);
        }}
        title="Delete thread?"
        description={`Permanently delete “${threadToDelete?.title ?? "this thread"}” and all replies. This cannot be undone.`}
        onConfirm={async () => {
          if (!threadToDelete) return;
          await deleteBoardThread(board.id, threadToDelete.id);
          setThreadToDelete(null);
          await load();
        }}
      />
      <KuratorModal open={inviteOpen} onOpenChange={setInviteOpen} title="Invite to Board">
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {friends.map((f) => (
            <li key={f.id}>
              <FriendCheckboxRow
                user={f}
                checked={inviteIds.has(f.id)}
                onCheckedChange={() => {
                  setInviteIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(f.id)) next.delete(f.id);
                    else next.add(f.id);
                    return next;
                  });
                }}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={inviteBusy || inviteIds.size === 0}
          onClick={() => void submitInvites()}
          className="mt-4 rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
        >
          {inviteBusy ? "Sending…" : "Send Invites"}
        </button>
      </KuratorModal>
    </div>
  );
}
