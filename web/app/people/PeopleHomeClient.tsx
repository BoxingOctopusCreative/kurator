"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { User, UserRoundSearch } from "lucide-react";
import type { PublicUser } from "@/lib/api";
import {
  fetchMyFriends,
  fetchPeopleYouMayKnow,
  publicLegalNameLine,
  searchUsers,
} from "@/lib/api";
import { safeImageSrcUrl } from "@/lib/safeUrl";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { useAuth } from "@/components/AuthProvider";

function PersonSearchRow({ u }: { u: PublicUser }) {
  const avatarSrc = safeImageSrcUrl(u.avatar_url);
  const legal = publicLegalNameLine(u);
  return (
    <li>
      <Link
        href={`/people/${encodeURIComponent(u.username)}`}
        className="flex items-start gap-3 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 px-4 py-3 transition-colors hover:border-kurator-accent/50"
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote CDN / S3 profile URL
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-kurator-muted" aria-hidden>
              <User className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-medium text-kurator-fg">{u.display_name || u.username || `User ${u.id}`}</span>
          {legal ? <p className="mt-0.5 text-xs text-kurator-muted/90">{legal}</p> : null}
          {u.location ? <p className="mt-0.5 text-xs text-kurator-muted">{u.location}</p> : null}
          {u.bio ? <p className="mt-1 line-clamp-2 text-sm text-kurator-muted">{u.bio}</p> : null}
        </div>
      </Link>
    </li>
  );
}

function FriendRow({ u }: { u: PublicUser }) {
  const avatarSrc = safeImageSrcUrl(u.avatar_url);
  const legal = publicLegalNameLine(u);
  return (
    <li>
      <Link
        href={`/people/${encodeURIComponent(u.username)}`}
        className="flex items-center gap-3 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 px-4 py-3 transition-colors hover:border-kurator-accent/50"
      >
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote CDN / S3 profile URL
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-kurator-muted" aria-hidden>
              <User className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-medium text-kurator-fg">{u.display_name || u.username || `User ${u.id}`}</span>
          {legal ? <p className="mt-0.5 text-xs text-kurator-muted/90">{legal}</p> : null}
        </div>
      </Link>
    </li>
  );
}

function SuggestedPersonCard({ u }: { u: PublicUser }) {
  const avatarSrc = safeImageSrcUrl(u.avatar_url);
  const label = u.display_name || u.username || `User ${u.id}`;
  return (
    <li>
      <Link
        href={`/people/${encodeURIComponent(u.username)}`}
        className="flex flex-col items-center gap-2 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-4 text-center transition-colors hover:border-kurator-accent/50"
      >
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-kurator-border bg-kurator-bg">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote CDN / S3 profile URL
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-kurator-muted" aria-hidden>
              <User className="h-7 w-7" />
            </div>
          )}
        </div>
        <span className="line-clamp-2 w-full text-sm font-medium text-kurator-fg">{label}</span>
      </Link>
    </li>
  );
}

export function PeopleHomeClient() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<PublicUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [friends, setFriends] = useState<PublicUser[] | null>(null);
  const [friendsTotal, setFriendsTotal] = useState(0);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<PublicUser[] | null>(null);
  const [suggestionsTotal, setSuggestionsTotal] = useState(0);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const runSearch = useCallback(async () => {
    if (!debounced) {
      setResults(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResults(await searchUsers(debounced));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  useEffect(() => {
    if (user === undefined || user === null) {
      setFriends(null);
      setSuggestions(null);
      setFriendsLoading(false);
      setSuggestionsLoading(false);
      setFriendsError(null);
      setSuggestionsError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setFriendsLoading(true);
      setSuggestionsLoading(true);
      setFriendsError(null);
      setSuggestionsError(null);
      try {
        const [fr, py] = await Promise.all([
          fetchMyFriends({ limit: 48 }),
          fetchPeopleYouMayKnow({ limit: 48 }),
        ]);
        if (cancelled) return;
        setFriends(fr.items);
        setFriendsTotal(fr.total);
        setSuggestions(py.items);
        setSuggestionsTotal(py.total);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Could not load people lists.";
        setFriendsError(msg);
        setSuggestionsError(msg);
        setFriends([]);
        setSuggestions([]);
      } finally {
        if (!cancelled) {
          setFriendsLoading(false);
          setSuggestionsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (user === undefined) {
    return <p className="text-sm text-kurator-muted">Loading…</p>;
  }

  if (user === null) {
    return (
      <div className="mx-auto max-w-lg rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-6 text-center">
        <p className="text-sm text-kurator-muted">
          Sign in to see friends, suggestions from your network, and search for people.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">People</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Friends are accounts where you follow each other. People you may know have public profiles and are
            followed by your friends. You can still search for anyone with a public profile.
          </p>
        </div>
      </PageHeroUnsplash>

      <section className="mt-8" aria-labelledby="friends-heading">
        <h2 id="friends-heading" className="kurator-panel-title text-kurator-fg">
          Friends
        </h2>
        <p className="mt-1 text-xs text-kurator-muted">Mutual followers — you and they follow each other.</p>
        {friendsError ? (
          <p className="mt-3 text-sm text-amber-200/90" role="alert">
            {friendsError}
          </p>
        ) : null}
        {friendsLoading && friends === null ? (
          <p className="mt-3 text-sm text-kurator-muted">Loading friends…</p>
        ) : null}
        {!friendsLoading && !friendsError && friends && friends.length === 0 ? (
          <p className="mt-3 text-sm text-kurator-muted">No friends yet. When someone follows you back, they show up here.</p>
        ) : null}
        {friends && friends.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {friends.map((u) => (
              <FriendRow key={u.id} u={u} />
            ))}
          </ul>
        ) : null}
        {friends && friendsTotal > friends.length ? (
          <p className="mt-2 text-xs text-kurator-muted">Showing {friends.length} of {friendsTotal}.</p>
        ) : null}
      </section>

      <section className="mt-10" aria-labelledby="pymk-heading">
        <h2 id="pymk-heading" className="kurator-panel-title text-kurator-fg">
          People You May Know
        </h2>
        <p className="mt-1 text-xs text-kurator-muted">
          Public profiles followed by your friends, excluding people you already follow.
        </p>
        {suggestionsError ? (
          <p className="mt-3 text-sm text-amber-200/90" role="alert">
            {suggestionsError}
          </p>
        ) : null}
        {suggestionsLoading && suggestions === null ? (
          <p className="mt-3 text-sm text-kurator-muted">Loading suggestions…</p>
        ) : null}
        {!suggestionsLoading && !suggestionsError && suggestions && suggestions.length === 0 ? (
          <p className="mt-3 text-sm text-kurator-muted">
            No suggestions right now. Add friends to see who they follow with public profiles.
          </p>
        ) : null}
        {suggestions && suggestions.length > 0 ? (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {suggestions.map((u) => (
              <SuggestedPersonCard key={u.id} u={u} />
            ))}
          </ul>
        ) : null}
        {suggestions && suggestionsTotal > suggestions.length ? (
          <p className="mt-2 text-xs text-kurator-muted">Showing {suggestions.length} of {suggestionsTotal}.</p>
        ) : null}
      </section>

      <section className="mt-10" aria-labelledby="search-heading">
        <h2 id="search-heading" className="kurator-panel-title text-kurator-fg">
          Search
        </h2>
        <label className="mt-3 block text-sm">
          <span className="text-kurator-muted">Find people</span>
          <div className="relative mt-1">
            <UserRoundSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kurator-muted"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or keywords in bio…"
              className="w-full rounded-lg border border-kurator-border bg-kurator-bg py-2 pl-10 pr-3 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
          </div>
        </label>

        {error && (
          <p className="mt-4 text-sm text-amber-200/90" role="alert">
            {error}
          </p>
        )}

        {loading && debounced && <p className="mt-6 text-sm text-kurator-muted">Searching…</p>}

        {!loading && results && results.length === 0 && debounced && (
          <p className="mt-6 text-sm text-kurator-muted">No profiles match that search.</p>
        )}

        {results && results.length > 0 && (
          <ul className="mt-6 space-y-2">
            {results.map((u) => (
              <PersonSearchRow key={u.id} u={u} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
