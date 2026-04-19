"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Layers, Lock } from "lucide-react";
import type { CollectionListResponse } from "@/lib/api";
import { createCollection, fetchCollections } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";

const sortOptions: { value: string; label: string }[] = [
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "updated_desc", label: "Recently updated" },
  { value: "created_desc", label: "Recently created" },
  { value: "items_desc", label: "Most items" },
];

const descFilterOptions: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  { value: "yes", label: "Has description" },
  { value: "no", label: "No description" },
];

export function CollectionsBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const sort = searchParams.get("sort") ?? "name_asc";
  const hasDesc = (searchParams.get("has_description") ?? "") as "" | "yes" | "no";
  const qUrl = searchParams.get("q") ?? "";
  const scopeRaw = searchParams.get("scope") ?? "all";
  const scope: "all" | "following" =
    scopeRaw === "following" && user ? "following" : "all";

  const [qInput, setQInput] = useState(qUrl);
  const [data, setData] = useState<CollectionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPublic, setNewPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const replaceQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      router.replace(`${pathname}?${p.toString()}`);
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (user === null && scopeRaw === "following") {
      replaceQuery({ scope: null, page: "1" });
    }
  }, [user, scopeRaw, replaceQuery]);

  useEffect(() => {
    setQInput(qUrl);
  }, [qUrl]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== qUrl) {
        replaceQuery({ q: qInput.trim() || null, page: "1" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, qUrl, replaceQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCollections({
      q: qUrl || undefined,
      page,
      limit: 12,
      sort,
      has_description: hasDesc || undefined,
      scope: scope === "following" ? "following" : "all",
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load collections.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [qUrl, page, sort, hasDesc, scope, listVersion]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  async function onCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setCreating(true);
    try {
      const name = assertCollectionOrWishlistName(newName, "Collection name");
      const descRaw = newDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(newDesc, LIMITS.description, "Description")
        : undefined;
      await createCollection({ name, description, is_public: newPublic });
      setNewName("");
      setNewDesc("");
      setNewPublic(true);
      setFormMsg("Collection created.");
      setListVersion((v) => v + 1);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not create collection.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-kurator-fg md:text-3xl">Collections</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Public shelves are visible to everyone. Private shelves are only visible to you. Follow people
            under People to see their public collections in the Following tab.
          </p>
        </div>
      </div>

      <form
        onSubmit={onCreateCollection}
        className="mb-8 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4"
      >
        <h2 className="text-sm font-medium text-kurator-fg">New collection</h2>
        <p className="mt-1 text-xs text-kurator-muted">
          Sign in required. Your new shelf appears in this list and in Add item → Collection.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[200px] flex-1 text-sm">
            <span className="text-kurator-muted">Name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Graphic novels, Switch games"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
          </label>
          <label className="block min-w-[220px] flex-2 text-sm">
            <span className="text-kurator-muted">Description (optional)</span>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short note about this shelf"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              autoComplete="off"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-kurator-muted">
            <input
              type="checkbox"
              checked={newPublic}
              onChange={(e) => setNewPublic(e.target.checked)}
              className="rounded-sm border-kurator-border"
            />
            Public
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
        {formMsg && (
          <p
            className={`mt-3 text-sm ${formMsg.startsWith("Collection created") ? "text-emerald-300/90" : "text-amber-200/90"}`}
            role="status"
          >
            {formMsg}
          </p>
        )}
      </form>

      {user && (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Collection source">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "all"}
            onClick={() => replaceQuery({ scope: null, page: "1" })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              scope === "all"
                ? "bg-kurator-accent text-kurator-onAccent"
                : "border border-kurator-border text-kurator-muted hover:bg-kurator-border/40"
            }`}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "following"}
            onClick={() => replaceQuery({ scope: "following", page: "1" })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              scope === "following"
                ? "bg-kurator-accent text-kurator-onAccent"
                : "border border-kurator-border text-kurator-muted hover:bg-kurator-border/40"
            }`}
          >
            Following
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block min-w-[200px] flex-1 text-sm">
          <span className="text-kurator-muted">Search</span>
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Name or description…"
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            autoComplete="off"
          />
        </label>
        <label className="block min-w-[160px] text-sm">
          <span className="text-kurator-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => replaceQuery({ sort: e.target.value, page: "1" })}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[180px] text-sm">
          <span className="text-kurator-muted">Description</span>
          <select
            value={hasDesc}
            onChange={(e) =>
              replaceQuery({
                has_description: e.target.value || null,
                page: "1",
              })
            }
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
          >
            {descFilterOptions.map((o) => (
              <option key={o.value || "any"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {loading && !data && (
        <p className="text-sm text-kurator-muted">Loading collections…</p>
      )}

      {!loading && data && data.items.length === 0 && (
        <p className="rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
          No collections match your filters.
        </p>
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/collections/${c.id}`}
                  className="flex h-full flex-col rounded-xl border border-kurator-border bg-kurator-surface p-4 shadow-xs transition-colors hover:border-kurator-accent/50 hover:bg-kurator-bg/80"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kurator-border/60 text-kurator-accent">
                      <Layers className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium text-kurator-fg">{c.name}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-kurator-muted">
                        <span>
                          {c.item_count} {c.item_count === 1 ? "item" : "items"}
                        </span>
                        {c.is_public === false && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                            <Lock className="h-3 w-3" aria-hidden />
                            Private
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {c.description && (
                    <p className="mt-3 line-clamp-3 text-sm text-kurator-muted">{c.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <nav className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm" aria-label="Pagination">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => replaceQuery({ page: String(page - 1) })}
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-kurator-muted hover:bg-kurator-border/40 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-kurator-muted">
              Page {page} of {totalPages}
              <span className="ml-2 text-kurator-muted/70">({data.total} total)</span>
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => replaceQuery({ page: String(page + 1) })}
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-kurator-muted hover:bg-kurator-border/40 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
