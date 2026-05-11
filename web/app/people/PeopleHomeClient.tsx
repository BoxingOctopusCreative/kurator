"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { User, UserRoundSearch } from "lucide-react";
import type { PublicUser } from "@/lib/api";
import { publicLegalNameLine, searchUsers } from "@/lib/api";
import { safeImageSrcUrl } from "@/lib/safeUrl";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { useAuth } from "@/components/AuthProvider";

export function PeopleHomeClient() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<PublicUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (user === undefined) {
    return <p className="text-sm text-kurator-muted">Loading…</p>;
  }

  if (user === null) {
    return (
      <div className="mx-auto max-w-lg rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-6 text-center">
        <p className="text-sm text-kurator-muted">Sign in to search for people and follow their public collections.</p>
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
            Find collectors by display name or bio, follow them, and browse their public shelves from their
            profile or the Following tab on Collections.
          </p>
        </div>
      </PageHeroUnsplash>

      <label className="block text-sm">
        <span className="text-kurator-muted">Search</span>
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
          {results.map((u) => {
            const avatarSrc = safeImageSrcUrl(u.avatar_url);
            return (
            <li key={u.id}>
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
                  {(() => {
                    const legal = publicLegalNameLine(u);
                    return legal ? (
                      <p className="mt-0.5 text-xs text-kurator-muted/90">{legal}</p>
                    ) : null;
                  })()}
                  {u.location ? <p className="mt-0.5 text-xs text-kurator-muted">{u.location}</p> : null}
                  {u.bio ? <p className="mt-1 line-clamp-2 text-sm text-kurator-muted">{u.bio}</p> : null}
                </div>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
