"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { BoardIcon } from "@/components/boards/BoardIcon";
import { BoardFlairBadge } from "@/components/boards/BoardFlairBadge";
import {
  acceptBoardInvite,
  dismissBoardInvite,
  fetchBoardFeed,
  fetchBoardInvites,
  fetchBoards,
  type Board,
  type BoardFeedSort,
  type BoardFeedThread,
  type BoardInvite,
  type BoardListTab,
} from "@/lib/api";
import { BoardCreateModal } from "@/components/boards/BoardCreateModal";
import { boardPath, boardThreadPath } from "@/lib/boardPaths";
import { formatRelativeTimeShort } from "@/lib/relativeTime";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

function BoardRow({ b }: { b: Board }) {
  return (
    <li>
      <div className="py-4">
        <Link
          href={boardPath(b.slug)}
          className="flex items-start gap-3 rounded-lg outline-hidden transition-colors hover:bg-kurator-border/25 focus-visible:ring-2 focus-visible:ring-kurator-accent -mx-2 px-2 py-0.5 sm:-mx-3 sm:px-3"
        >
          <BoardIcon iconUrl={b.icon_url} name={b.name} className="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <h2 className="kurator-shelf-tile-title font-medium text-kurator-fg">{b.name}</h2>
            {b.description ? (
              <p className="mt-1 line-clamp-2 text-sm text-kurator-muted">{b.description}</p>
            ) : null}
          </div>
        </Link>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ps-14 text-xs text-kurator-muted">
          <span>{b.visibility === "private" ? "Private" : "Public"}</span>
          {b.thread_count != null ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {b.thread_count} thread{b.thread_count === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
          {b.member_count != null && b.visibility === "private" ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {b.member_count} member{b.member_count === 1 ? "" : "s"}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function FeedThreadRow({ t }: { t: BoardFeedThread }) {
  return (
    <li>
      <article className="py-4">
        <Link
          href={boardPath(t.board_slug)}
          className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs font-medium text-kurator-muted outline-hidden transition-colors hover:bg-kurator-border/25 hover:text-kurator-accent focus-visible:ring-2 focus-visible:ring-kurator-accent"
        >
          <BoardIcon iconUrl={t.board_icon_url} name={t.board_name} className="h-5 w-5" />
          {t.board_name}
        </Link>
        <Link
          href={boardThreadPath(t.board_slug, t.id)}
          className="block rounded-lg outline-hidden transition-colors hover:bg-kurator-border/25 focus-visible:ring-2 focus-visible:ring-kurator-accent -mx-2 px-2 py-0.5 sm:-mx-3 sm:px-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="kurator-shelf-tile-title font-medium text-kurator-fg">{t.title}</h2>
            {t.flair_label ? <BoardFlairBadge label={t.flair_label} /> : null}
            {t.is_locked ? (
              <span className="rounded bg-kurator-border/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                Locked
              </span>
            ) : null}
          </div>
        </Link>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kurator-muted">
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
          <span title={t.updated_at}>Updated {formatRelativeTimeShort(t.updated_at)}</span>
        </p>
      </article>
    </li>
  );
}

const TABS: { id: BoardListTab | "invites"; label: string; authOnly?: boolean }[] = [
  { id: "discover", label: "Discover" },
  { id: "mine", label: "Mine", authOnly: true },
  { id: "member", label: "Joined", authOnly: true },
  { id: "invites", label: "Invites", authOnly: true },
];

const FEED_SORT_OPTIONS: { value: BoardFeedSort; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "active", label: "Most active" },
];

export function BoardsHomeClient() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<BoardListTab | "invites">("discover");
  const [boards, setBoards] = useState<Board[]>([]);
  const [feed, setFeed] = useState<BoardFeedThread[]>([]);
  const [feedSort, setFeedSort] = useState<BoardFeedSort>("updated");
  const [feedSearchInput, setFeedSearchInput] = useState("");
  const [feedSearchQ, setFeedSearchQ] = useState("");
  const [invites, setInvites] = useState<BoardInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setFeedSearchQ(feedSearchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [feedSearchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      if (tab === "invites") {
        if (!user) {
          setInvites([]);
          return;
        }
        setInvites(await fetchBoardInvites());
      } else if (tab === "discover") {
        setFeed(await fetchBoardFeed({ sort: feedSort, q: feedSearchQ }));
      } else {
        setBoards(await fetchBoards(tab));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load boards.");
    } finally {
      setLoading(false);
    }
  }, [tab, user, feedSort, feedSearchQ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAcceptInvite(inviteId: number) {
    setInviteBusy(inviteId);
    try {
      await acceptBoardInvite(inviteId);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not accept invite.");
    } finally {
      setInviteBusy(null);
    }
  }

  async function onDismissInvite(inviteId: number) {
    setInviteBusy(inviteId);
    try {
      await dismissBoardInvite(inviteId);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not dismiss invite.");
    } finally {
      setInviteBusy(null);
    }
  }

  return (
    <div>
      <PageHeroUnsplash bleedBottomMargin={false} bleedToMainTop>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Boards</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Discussion forums for your community — threads and replies, no voting.
          </p>
        </div>
      </PageHeroUnsplash>
      <div className="mt-8 mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between md:mt-10">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Board lists">
          {TABS.filter((t) => !t.authOnly || user).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                tab === t.id
                  ? "bg-kurator-accent text-kurator-onAccent"
                  : "border border-kurator-border text-kurator-muted hover:bg-kurator-border/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {user ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-kurator-accent px-4 py-2 text-sm font-semibold text-kurator-onAccent hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create Board
          </button>
        ) : (
          <Link
            href="/login?next=/boards"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-kurator-accent px-4 py-2 text-sm font-semibold text-kurator-onAccent hover:opacity-90"
          >
            Sign in to create
          </Link>
        )}
      </div>
      {tab === "discover" ? (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-0 flex-1 text-sm">
            <span className="text-kurator-muted">Search</span>
            <input
              type="search"
              value={feedSearchInput}
              onChange={(e) => setFeedSearchInput(e.target.value)}
              placeholder="Threads, boards, authors…"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
          </label>
          <label className="block min-w-[160px] text-sm">
            <span className="text-kurator-muted">Sort</span>
            <select
              value={feedSort}
              onChange={(e) => setFeedSort(e.target.value as BoardFeedSort)}
              aria-label="Sort board threads"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            >
              {FEED_SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {err ? (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {err}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-kurator-muted">Loading…</p>
      ) : tab === "invites" ? (
        invites.length === 0 ? (
          <p className="py-8 text-center text-sm text-kurator-muted">No pending board invitations.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-kurator-border p-0">
            {invites.map((inv) => (
              <li key={inv.id} className="py-4">
                <p className="text-sm text-kurator-fg">
                  Invitation to <span className="font-medium">{inv.board_name || "a private board"}</span>
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={inviteBusy === inv.id}
                    onClick={() => void onAcceptInvite(inv.id)}
                    className="rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={inviteBusy === inv.id}
                    onClick={() => void onDismissInvite(inv.id)}
                    className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:bg-kurator-border/30"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : tab === "discover" ? (
        feed.length === 0 ? (
          <p className="py-8 text-center text-sm text-kurator-muted">
            {feedSearchQ
              ? "No threads match your search."
              : "No public threads yet. Be the first to start a discussion."}
          </p>
        ) : (
          <ul className="m-0 list-none divide-y divide-kurator-border p-0">
            {feed.map((t) => (
              <FeedThreadRow key={t.id} t={t} />
            ))}
          </ul>
        )
      ) : boards.length === 0 ? (
        <p className="py-8 text-center text-sm text-kurator-muted">Nothing here yet.</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-kurator-border p-0">
          {boards.map((b) => (
            <BoardRow key={b.id} b={b} />
          ))}
        </ul>
      )}
      <BoardCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(slug) => router.push(boardPath(slug))}
      />
    </div>
  );
}
