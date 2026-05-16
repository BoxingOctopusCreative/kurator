"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, ListOrdered, Lock, MessageCircle, Trash2, Users, Globe2, Globe } from "lucide-react";
import {
  type HitlistDiscoverSort,
  fetchLists,
  type List,
  unvoteHitlist,
  visibilityLabel,
  visibilityOf,
  voteHitlist,
} from "@/lib/api";
import { hitlistBrowsePath } from "@/lib/hitlistBrowsePath";
import { useAuth } from "@/components/AuthProvider";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { DeleteEntryBucketDialog, type EntryDeleteSubject } from "@/components/DeleteEntryBucketDialog";
import { HitlistCreateModal } from "@/components/HitlistCreateModal";
import { HitlistVoteColumn } from "@/components/HitlistVoteColumn";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";

export function ListsBrowser() {
  const router = useRouter();
  const { user } = useAuth();
  const [sort, setSort] = useState<HitlistDiscoverSort>("recent");
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteSubject, setDeleteSubject] = useState<EntryDeleteSubject | null>(null);
  const [voteBusyId, setVoteBusyId] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    setError(null);
    fetchLists({ sort })
      .then(setLists)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load hitlists."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload intentionally keyed by sort only
  }, [sort]);

  function isMyList(lst: List): boolean {
    return Boolean(user && Number(lst.user_id) === Number(user.id));
  }

  function onCreateClick() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent("/lists")}`);
      return;
    }
    setCreateOpen(true);
  }

  async function toggleListVote(lst: List) {
    if (!user || voteBusyId) return;
    const wasVoted = !!lst.viewer_has_voted;
    setVoteBusyId(lst.id);
    try {
      const stats = wasVoted ? await unvoteHitlist(lst.id) : await voteHitlist(lst.id);
      setLists((prev) =>
        prev.map((l) =>
          l.id === lst.id
            ? { ...l, vote_count: stats.vote_count, viewer_has_voted: stats.viewer_has_voted }
            : l,
        ),
      );
    } catch {
      /* keep row as loaded from server */
    } finally {
      setVoteBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <HitlistCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          reload();
        }}
      />
      <DeleteEntryBucketDialog
        variant="list"
        subject={deleteSubject}
        open={deleteSubject != null}
        onOpenChange={(v) => {
          if (!v) setDeleteSubject(null);
        }}
        onDeleted={() => {
          setDeleteSubject(null);
          reload();
        }}
      />
      <PageHeroUnsplash>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Hitlists</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Discover non-private hitlists from the community and from people you follow. Sort by what’s
            new, most upvoted, most active, or a blended “hottest” score. Create your own to curate picks
            across your shelves.
          </p>
        </header>
      </PageHeroUnsplash>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-kurator-muted sm:max-w-xs">
          <span className="shrink-0 font-medium text-kurator-fg">Show</span>
          <select
            className="min-w-0 flex-1 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={sort}
            onChange={(e) => setSort(e.target.value as HitlistDiscoverSort)}
            aria-label="Sort hitlists"
          >
            <option value="recent">Most recent</option>
            <option value="liked">Most liked</option>
            <option value="active">Most active</option>
            <option value="hottest">Hottest</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onCreateClick}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-kurator-accent px-4 py-2 text-sm font-semibold text-kurator-onAccent hover:opacity-90"
        >
          Create Your Own!
        </button>
      </div>

      {loading && <p className="text-sm text-kurator-muted">Loading hitlists…</p>}
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && lists.length === 0 && (
        <p className="rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          No hitlists match this view yet. {!user ? "Sign in to create one." : "Create one with Create Your Own!"}
        </p>
      )}

      {!loading && !error && lists.length > 0 && (
        <ul className="m-0 list-none space-y-4 p-0">
          {lists.map((lst) => (
            <li key={lst.id} className="relative">
              {isMyList(lst) ? (
                <button
                  type="button"
                  aria-label={`Delete hitlist ${lst.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteSubject({
                      id: lst.id,
                      name: lst.name,
                      entry_count: lst.item_count,
                    });
                  }}
                  className="absolute right-2 top-2 z-10 rounded-lg bg-kurator-bg/95 p-2 text-kurator-muted shadow-sm transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-kurator-border bg-kurator-surface shadow-surface transition-colors hover:border-kurator-accent/50 hover:bg-kurator-bg/80">
                <div className="flex flex-1 items-start gap-2 p-4 sm:gap-3">
                  <div className="pointer-events-auto shrink-0 pt-0.5">
                    <HitlistVoteColumn
                      voteCount={lst.vote_count ?? 0}
                      viewerHasVoted={!!lst.viewer_has_voted}
                      canVote={!!user}
                      busy={voteBusyId === lst.id}
                      onVoteToggle={() => void toggleListVote(lst)}
                      className="[&_button]:p-px [&_svg]:h-5 [&_svg]:w-5"
                      signInHint={false}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={hitlistBrowsePath({
                        id: lst.id,
                        slug: lst.slug,
                        visibility: visibilityOf(lst),
                        preferAppView: !!user,
                      })}
                      className="flex w-full min-w-0 flex-1 items-start gap-3 rounded-lg outline-hidden ring-kurator-accent transition-colors hover:bg-kurator-border/15 focus-visible:ring-2"
                    >
                      <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-md border border-kurator-border/60 bg-kurator-bg shadow-surface">
                        {lst.cover_art_url ? (
                          <ItemCoverImage url={lst.cover_art_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-kurator-border/50 text-kurator-accent">
                            <ListOrdered className="h-5 w-5" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="kurator-shelf-tile-title text-base font-medium text-kurator-fg">{lst.name}</h2>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kurator-muted">
                          <span>
                            {lst.item_count} {lst.item_count === 1 ? "item" : "items"}
                          </span>
                          {(() => {
                            const views = lst.view_count ?? 0;
                            const c = lst.comment_count ?? 0;
                            if (views === 0 && c === 0) return null;
                            return (
                              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-kurator-muted/90">
                                {views > 0 ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <Eye className="h-3 w-3" aria-hidden />
                                    {views}
                                  </span>
                                ) : null}
                                {c > 0 ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <MessageCircle className="h-3 w-3" aria-hidden />
                                    {c}
                                  </span>
                                ) : null}
                              </span>
                            );
                          })()}
                          {user != null && lst.user_id !== user.id && (
                            <span className="rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                              Member
                            </span>
                          )}
                          {user != null &&
                            lst.user_id === user.id &&
                            (() => {
                              const v = visibilityOf(lst);
                              if (v === "followers") return null;
                              const Icon =
                                v === "private"
                                  ? Lock
                                  : v === "public"
                                    ? Globe
                                    : v === "friends"
                                      ? Globe2
                                      : Users;
                              return (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                                  <Icon className="h-3 w-3" aria-hidden />
                                  {visibilityLabel(v)}
                                </span>
                              );
                            })()}
                        </p>
                        {lst.description ? (
                          <p className="mt-1.5 line-clamp-2 text-sm text-kurator-muted">{lst.description}</p>
                        ) : null}
                      </div>
                    </Link>
                  </div>
                </div>
                {lst.author ? (
                  <div className="flex items-center border-t border-kurator-border/60 px-4 py-2">
                    <ShelfAuthorLink author={lst.author} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
