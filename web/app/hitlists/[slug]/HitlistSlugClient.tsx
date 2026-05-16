"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Globe, Globe2, Link2, Lock, Users } from "lucide-react";
import {
  addHitlistComment,
  deleteHitlistComment,
  fetchHitlistBySlug,
  fetchHitlistComments,
  fetchListItems,
  unvoteHitlist,
  voteHitlist,
  visibilityLabel,
  visibilityOf,
  type HitlistComment,
  type HitlistDetail,
  type HitlistEntry,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { HitlistAddToAccountButton } from "@/components/HitlistAddToAccountButton";
import { HitlistEntriesSortableList } from "@/components/HitlistEntriesSortableList";
import { HitlistEntryListNoteEditor } from "@/components/HitlistEntryListNoteEditor";
import { HitlistShareButton } from "@/components/HitlistShareButton";
import { HitlistVoteColumn } from "@/components/HitlistVoteColumn";
import { MarkdownBody } from "@/components/MarkdownBody";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import { PageHeroUnsplash, MAIN_COLUMN_BRAND_STRIP_CLASS } from "@/components/PageHeroUnsplash";
import { PublicBrandMenu } from "@/components/PublicBrandMenu";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { collectHitlistEntryCoverUrls } from "@/lib/hitlistHeroCollage";

export function HitlistSlugClient() {
  const params = useParams();
  const router = useRouter();
  const slugRaw = params.slug;
  const slug = typeof slugRaw === "string" ? decodeURIComponent(slugRaw.trim()) : "";
  const { user } = useAuth();

  const [list, setList] = useState<HitlistDetail | null | undefined>(undefined);
  const [entries, setEntries] = useState<HitlistEntry[]>([]);
  const [comments, setComments] = useState<HitlistComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const commentFormRef = useRef<HTMLFormElement>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setList(null);
      return;
    }
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const h = await fetchHitlistBySlug(slug);
        if (cancelled) return;
        if (!h) {
          setList(null);
          return;
        }
        setList(h);
        const e = await fetchListItems(h.id);
        if (!cancelled) setEntries(e);
        if (h.comments_enabled !== false) {
          const c = await fetchHitlistComments(h.id);
          if (!cancelled) setComments(c);
        } else if (!cancelled) setComments([]);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load hitlist.");
          setList(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!user || list === undefined || list === null) return;
    router.replace(`/lists/${list.id}`);
  }, [user, list, router]);

  async function toggleVote() {
    if (!list || !user || voteBusy) return;
    const prevList = list;
    const wasVoted = !!list.viewer_has_voted;
    setError(null);
    setVoteBusy(true);
    try {
      const stats = wasVoted ? await unvoteHitlist(prevList.id) : await voteHitlist(prevList.id);
      setList((L) =>
        L && L.id === prevList.id
          ? { ...L, vote_count: stats.vote_count, viewer_has_voted: stats.viewer_has_voted }
          : L,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed.");
    } finally {
      setVoteBusy(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!list || !user || commentDraft.trim() === "") return;
    setCommentBusy(true);
    try {
      await addHitlistComment(list.id, commentDraft);
      setCommentDraft("");
      const c = await fetchHitlistComments(list.id);
      setComments(c);
      const h = await fetchHitlistBySlug(slug);
      if (h) setList(h);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment.");
    } finally {
      setCommentBusy(false);
    }
  }

  if (!slug) {
    return <p className="text-sm text-red-400">Invalid hitlist link.</p>;
  }

  if (list === undefined) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-kurator-muted">Loading…</p>
      </div>
    );
  }

  if (list === null) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <p className="text-sm text-kurator-muted">This hitlist was not found or is not public.</p>
        <Link href="/lists" className="text-sm text-kurator-accent hover:underline">
          All hitlists
        </Link>
      </div>
    );
  }

  const listVis = visibilityOf(list);
  const permalinkPath = `/hitlists/${encodeURIComponent(slug)}`;
  const showEntryNumbers = list.entries_numbered !== false;
  const EntryListTag = showEntryNumbers ? "ol" : "ul";
  const heroCollageCoverUrls = useMemo(() => collectHitlistEntryCoverUrls(entries), [entries]);

  return (
    <div className="mx-auto max-w-5xl">
      {error ? (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      <header className="mb-8 flex flex-col gap-0">
        <div className={`${MAIN_COLUMN_BRAND_STRIP_CLASS} bg-black`}>
          <div className="flex items-center justify-between gap-3 px-5 py-3 md:px-8 md:py-3.5">
            <Link href="/" className="inline-block min-w-0 max-w-full shrink">
              <Image
                src="https://assets.kuratorapp.cc/brand/PNG/kurator_wide-white.png"
                alt="Kurator"
                width={256}
                height={128}
                className="h-auto w-32 max-w-full sm:w-40 md:w-48"
                priority
              />
            </Link>
            <PublicBrandMenu />
          </div>
        </div>
        <PageHeroUnsplash
          bleedBottomMargin={false}
          bleedToMainTop={false}
          customBackgroundUrl={(list.cover_art_url ?? "").trim() || null}
          collageCoverUrls={heroCollageCoverUrls}
        >
          <div className="flex flex-col gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">{list.name}</h1>
              <p className="mt-2 text-xs text-kurator-muted">
                Public hitlist ·{" "}
                <Link href={`/lists/${list.id}`} className="text-kurator-accent hover:underline">
                  Open in app view
                </Link>
              </p>
              {list.author ? (
                <div className="mt-2">
                  <ShelfAuthorLink author={list.author} variant="avatarAndName" />
                </div>
              ) : null}
              {list.description?.trim() ? (
                <div className="relative mt-3">
                  <div className="pe-[5.75rem] sm:pe-28">
                    <MarkdownBody markdown={list.description} />
                  </div>
                  <div className="pointer-events-auto absolute end-0 bottom-0">
                    <HitlistVoteColumn
                      voteCount={list.vote_count ?? 0}
                      viewerHasVoted={list.viewer_has_voted ?? false}
                      canVote={!!user}
                      busy={voteBusy}
                      onVoteToggle={() => void toggleVote()}
                    />
                  </div>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-kurator-muted">
                <span>
                  {list.item_count} {list.item_count === 1 ? "entry" : "entries"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="font-mono text-[11px]">{permalinkPath}</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded-md border border-kurator-border px-1.5 py-0.5 text-[10px] font-medium text-kurator-fg hover:border-kurator-accent/50"
                    onClick={() => {
                      const u = `${window.location.origin}${permalinkPath}`;
                      void navigator.clipboard.writeText(u);
                    }}
                  >
                    <Copy className="h-3 w-3" aria-hidden />
                    Copy
                  </button>
                  <HitlistShareButton permalinkPath={permalinkPath} listName={list.name} />
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                  {(() => {
                    const Icon =
                      listVis === "private"
                        ? Lock
                        : listVis === "public"
                          ? Globe
                          : listVis === "friends"
                            ? Globe2
                            : Users;
                    return <Icon className="h-3 w-3" aria-hidden />;
                  })()}
                  {visibilityLabel(listVis)}
                </span>
                {!list.description?.trim() ? (
                  <span className="ms-auto shrink-0">
                    <HitlistVoteColumn
                      voteCount={list.vote_count ?? 0}
                      viewerHasVoted={list.viewer_has_voted ?? false}
                      canVote={!!user}
                      busy={voteBusy}
                      onVoteToggle={() => void toggleVote()}
                    />
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </PageHeroUnsplash>
      </header>

      <Link
        href="/lists"
        className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All hitlists
      </Link>

      {entries.length === 0 ? (
        <p className="mb-8 rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          Nothing on this hitlist yet.
        </p>
      ) : (
        <HitlistEntriesSortableList
          listId={list.id}
          entries={entries}
          setEntries={setEntries}
          showNumbers={showEntryNumbers}
          canReorder={Boolean(user && list.may_edit_entries)}
          showItemOpenLink={false}
          listTag={EntryListTag}
          listClassName="mb-8 list-none space-y-2 p-0"
          getExtras={(entry) => ({
            belowTitle: (
              <>
                {entry.item?.collection_id?.trim() && user && list.may_edit_entries ? (
                  <HitlistEntryListNoteEditor
                    listId={list.id}
                    entry={entry}
                    onUpdated={(entryId, description) => {
                      setEntries((prev) =>
                        prev.map((e) => (e.id === entryId ? { ...e, description } : e)),
                      );
                    }}
                  />
                ) : null}
                {user || entry.item?.collection_id?.trim() ? (
                  <HitlistAddToAccountButton entry={entry} />
                ) : null}
              </>
            ),
          })}
        />
      )}

      {list.comments_enabled !== false ? (
        <section className="mb-12 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 shadow-surface">
          <h2 className="text-lg font-medium text-kurator-fg">Comments</h2>
          {user ? (
            <form
              ref={commentFormRef}
              onSubmit={(e) => void submitComment(e)}
              className="mt-3 space-y-2"
            >
              <MarkdownRichEditor
                value={commentDraft}
                onChange={setCommentDraft}
                variant="compact"
                disabled={commentBusy}
                placeholder="Write a comment…"
                aria-label="Comment"
                onCancelChord={() => setCommentDraft("")}
                onSaveChord={() => commentFormRef.current?.requestSubmit()}
              />
              <button
                type="submit"
                disabled={commentBusy || commentDraft.trim() === ""}
                className="rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
              >
                {commentBusy ? "Posting…" : "Post"}
              </button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-kurator-muted">Sign in to comment.</p>
          )}
          <ul className="mt-4 space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-kurator-border/70 bg-kurator-bg/40 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {c.author ? (
                    <ShelfAuthorLink author={c.author} variant="avatarAndName" />
                  ) : (
                    <span className="text-xs text-kurator-muted">User #{c.user_id}</span>
                  )}
                  {user &&
                    (Number(user.id) === c.user_id ||
                      (list && Number(user.id) === Number(list.user_id))) ? (
                    <button
                      type="button"
                      className="text-[11px] text-red-300 hover:underline"
                      onClick={async () => {
                        try {
                          await deleteHitlistComment(list.id, c.id);
                          const cm = await fetchHitlistComments(list.id);
                          setComments(cm);
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 text-kurator-muted">
                  <MarkdownBody markdown={c.body} />
                </div>
              </li>
            ))}
          </ul>
          {comments.length === 0 ? (
            <p className="mt-3 text-xs text-kurator-muted">No comments yet.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
