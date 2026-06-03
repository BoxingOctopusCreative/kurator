"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { shelfAuthorFromProfileUrl } from "@/lib/shelfAuthor";
import { useAuth } from "@/components/AuthProvider";
import { isProPlan } from "@/lib/billing";
import {
  clearCustomThemeFromDocument,
  deleteCreatedCustomTheme,
  fetchCustomThemeLibrary,
  fetchMyCustomTheme,
  installMarketplaceTheme,
  listPublishedCustomThemes,
  removeCustomThemeFromLibrary,
  setActiveCustomTheme,
  unpublishCustomTheme,
  type CustomThemeLibraryEntry,
  type PublishedCustomThemeSummary,
} from "@/lib/customTheme";

type Tab = "marketplace" | "library";

type Props = {
  userId: number;
  isPro: boolean;
};

function actionButtonClass(tone: "default" | "accent" | "warn" | "danger" = "default") {
  const base =
    "rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  switch (tone) {
    case "accent":
      return `${base} border-kurator-accent/50 text-kurator-accent hover:bg-kurator-accent/10`;
    case "warn":
      return `${base} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`;
    case "danger":
      return `${base} border-red-500/40 text-red-300 hover:bg-red-500/10`;
    default:
      return `${base} border-kurator-border text-kurator-fg hover:bg-kurator-border/40`;
  }
}

export function CustomThemeMarketplace({ userId, isPro }: Props) {
  const { refresh } = useAuth();
  const [tab, setTab] = useState<Tab>("marketplace");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Theme marketplace sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "marketplace"}
          onClick={() => setTab("marketplace")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "marketplace"
              ? "bg-kurator-accent text-kurator-onAccent"
              : "border border-kurator-border text-kurator-muted hover:bg-kurator-border/40"
          }`}
        >
          Marketplace
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "library"}
          onClick={() => setTab("library")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "library"
              ? "bg-kurator-accent text-kurator-onAccent"
              : "border border-kurator-border text-kurator-muted hover:bg-kurator-border/40"
          }`}
        >
          My Theme Library
        </button>
      </div>

      {message ? (
        <p
          className={`text-sm ${message.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      {tab === "marketplace" ? (
        <MarketplaceTab
          userId={userId}
          isPro={isPro}
          onMessage={setMessage}
          onInstalled={() => setTab("library")}
        />
      ) : (
        <LibraryTab userId={userId} isPro={isPro} onMessage={setMessage} refresh={refresh} />
      )}
    </div>
  );
}

function MarketplaceTab({
  userId,
  isPro,
  onMessage,
  onInstalled,
}: {
  userId: number;
  isPro: boolean;
  onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void;
  onInstalled: () => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PublishedCustomThemeSummary[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    onMessage(null);
    try {
      const [published, library] = await Promise.all([
        listPublishedCustomThemes(q),
        isPro ? fetchCustomThemeLibrary().catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      ]);
      const others = published.items.filter(
        (item) => item.author_user_id == null || item.author_user_id !== userId,
      );
      setItems(others);
      const ids = new Set(
        library.items.filter((e) => e.source === "marketplace").map((e) => e.ref_id),
      );
      setInstalledIds(ids);
    } catch (err) {
      onMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not load marketplace themes.",
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId, isPro, onMessage]);

  useEffect(() => {
    void load("");
  }, [load]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    await load(query);
  }

  async function onInstall(id: string) {
    if (!isPro) {
      onMessage({ tone: "bad", text: "Kurator Pro is required to add themes to your library." });
      return;
    }
    setBusyId(id);
    onMessage(null);
    try {
      await installMarketplaceTheme(id);
      setInstalledIds((prev) => new Set(prev).add(id));
      onMessage({ tone: "ok", text: "Theme added to your library." });
      onInstalled();
    } catch (err) {
      onMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not install theme.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-kurator-muted">
        Search and browse recently published themes from other Kurator Pro users.
      </p>

      <form onSubmit={(e) => void onSearch(e)} className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search themes…"
          className="min-w-48 flex-1 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
        />
        <button
          type="submit"
          disabled={loading}
          className={actionButtonClass()}
        >
          Search
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-kurator-muted">Loading themes…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-kurator-muted">No themes from other users found.</p>
      ) : (
        <ul className="divide-y divide-kurator-border rounded-lg border border-kurator-border">
          {items.map((item) => {
            const installed = installedIds.has(item.id);
            return (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-kurator-fg">{item.name}</p>
                  {item.description ? (
                    <p className="mt-0.5 text-sm text-kurator-muted">{item.description}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kurator-muted">
                    {(() => {
                      const author =
                        !item.author_deleted
                          ? shelfAuthorFromProfileUrl(
                              item.author_profile_url,
                              item.author_display_name,
                            )
                          : null;
                      if (author) {
                        return (
                          <>
                            <span>by</span>
                            <ShelfAuthorLink author={author} variant="avatarAndName" />
                            <span>· v{item.version}</span>
                          </>
                        );
                      }
                      return (
                        <span>
                          by {item.author_display_name} · v{item.version}
                        </span>
                      );
                    })()}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={installed || busyId === item.id}
                  onClick={() => void onInstall(item.id)}
                  className={actionButtonClass("accent")}
                >
                  {installed ? "In library" : busyId === item.id ? "Adding…" : "Add to library"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LibraryTab({
  isPro,
  onMessage,
  refresh,
}: {
  userId: number;
  isPro: boolean;
  onMessage: (m: { tone: "ok" | "bad"; text: string } | null) => void;
  refresh: () => Promise<void>;
}) {
  const [items, setItems] = useState<CustomThemeLibraryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [publishedVersionCount, setPublishedVersionCount] = useState(0);
  const [hasSavedTheme, setHasSavedTheme] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "unpublish" | "delete" } | null>(null);

  const load = useCallback(async () => {
    if (!isPro) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    onMessage(null);
    try {
      const [library, mine] = await Promise.all([
        fetchCustomThemeLibrary(),
        fetchMyCustomTheme().catch(() => null),
      ]);
      setItems(library.items);
      setActiveId(library.active_custom_theme_library_id ?? null);
      setPublishedVersionCount(mine?.published_version_count ?? 0);
      setHasSavedTheme(Boolean(mine?.theme_id));
    } catch (err) {
      onMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not load your theme library.",
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isPro, onMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSetTheme(libraryId: string) {
    setBusyKey(`set:${libraryId}`);
    onMessage(null);
    try {
      await setActiveCustomTheme(libraryId);
      setActiveId(libraryId);
      await refresh();
      onMessage({ tone: "ok", text: "Theme applied across the app." });
    } catch (err) {
      onMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not set theme.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function onUnsetTheme() {
    setBusyKey("unset");
    onMessage(null);
    try {
      await setActiveCustomTheme(null);
      setActiveId(null);
      clearCustomThemeFromDocument();
      await refresh();
      onMessage({ tone: "ok", text: "Restored Kurator default theme." });
    } catch (err) {
      onMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not unset theme.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function onRemove(libraryId: string) {
    setBusyKey(`remove:${libraryId}`);
    onMessage(null);
    try {
      await removeCustomThemeFromLibrary(libraryId);
      if (activeId === libraryId) {
        setActiveId(null);
        clearCustomThemeFromDocument();
        await refresh();
      }
      await load();
      onMessage({ tone: "ok", text: "Theme removed from your library." });
    } catch (err) {
      onMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not remove theme.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function onUnpublish() {
    setBusyKey("unpublish");
    onMessage(null);
    try {
      const result = await unpublishCustomTheme();
      setPublishedVersionCount(0);
      setConfirm(null);
      if (result.active_cleared) {
        setActiveId(null);
        clearCustomThemeFromDocument();
        await refresh();
      }
      await load();
      onMessage({
        tone: "ok",
        text: result.theme_name
          ? `“${result.theme_name}” was removed from the marketplace.`
          : "Theme unpublished.",
      });
    } catch (err) {
      onMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not unpublish theme.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function onDelete() {
    setBusyKey("delete");
    onMessage(null);
    try {
      await deleteCreatedCustomTheme();
      setHasSavedTheme(false);
      setPublishedVersionCount(0);
      setConfirm(null);
      clearCustomThemeFromDocument();
      await refresh();
      await load();
      onMessage({ tone: "ok", text: "Theme deleted." });
    } catch (err) {
      onMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not delete theme.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  if (!isPro) {
    return (
      <p className="text-sm text-kurator-muted">
        Kurator Pro is required to manage a theme library.{" "}
        <Link href="/settings/billing" className="text-kurator-accent hover:underline">
          Upgrade to Pro
        </Link>
      </p>
    );
  }

  const isPublished = publishedVersionCount > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-kurator-muted">
        Themes you have created and marketplace themes you have added.
      </p>

      {confirm ? (
        <div
          className={`rounded-lg border p-4 text-sm ${
            confirm.kind === "delete"
              ? "border-red-500/30 bg-red-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          <p className="text-kurator-fg">
            {confirm.kind === "delete"
              ? "Delete permanently removes your saved theme draft. This cannot be undone."
              : "Unpublish removes this theme from the marketplace. Anyone actively using it will switch back to Kurator defaults."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyKey != null}
              onClick={() => void (confirm.kind === "delete" ? onDelete() : onUnpublish())}
              className={
                confirm.kind === "delete"
                  ? "rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  : "rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              }
            >
              {confirm.kind === "delete" ? "Delete theme" : "Unpublish theme"}
            </button>
            <button
              type="button"
              disabled={busyKey != null}
              onClick={() => setConfirm(null)}
              className={actionButtonClass()}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-kurator-muted">Loading library…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-kurator-muted">
          Your library is empty. Browse the Marketplace tab to add themes, or{" "}
          <Link href="/settings/theme" className="text-kurator-accent hover:underline">
            create your own
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-kurator-border rounded-lg border border-kurator-border">
          {items.map((item) => {
            const isOwn = item.source === "own";
            const isActive = activeId === item.id;
            const busy = busyKey != null;

            return (
              <li key={item.id} className="space-y-3 p-4">
                <div>
                  <p className="font-medium text-kurator-fg">
                    {item.name}
                    {isOwn ? (
                      <span className="ml-2 text-xs font-normal text-kurator-muted">(yours)</span>
                    ) : null}
                    {isActive ? (
                      <span className="ml-2 text-xs font-normal text-kurator-accent">Active</span>
                    ) : null}
                  </p>
                  {item.description ? (
                    <p className="mt-0.5 text-sm text-kurator-muted">{item.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-kurator-muted">
                    {isOwn ? "Created by you" : "Added from marketplace"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {isOwn ? (
                    <>
                      <Link
                        href="/settings/theme"
                        className={actionButtonClass("accent")}
                      >
                        Edit Theme
                      </Link>
                      {!isActive ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onSetTheme(item.id)}
                          className={actionButtonClass()}
                        >
                          {busyKey === `set:${item.id}` ? "Setting…" : "Set Theme"}
                        </button>
                      ) : null}
                      {isActive ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onUnsetTheme()}
                          className={actionButtonClass()}
                        >
                          {busyKey === "unset" ? "Unsetting…" : "Unset Theme"}
                        </button>
                      ) : null}
                      {isPublished ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirm({ kind: "unpublish" })}
                          className={actionButtonClass("warn")}
                        >
                          Unpublish Theme
                        </button>
                      ) : null}
                      {hasSavedTheme && !isPublished ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirm({ kind: "delete" })}
                          className={actionButtonClass("danger")}
                        >
                          Delete Theme
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {isActive ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onUnsetTheme()}
                          className={actionButtonClass()}
                        >
                          {busyKey === "unset" ? "Unsetting…" : "Unset Theme"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onRemove(item.id)}
                        className={actionButtonClass("danger")}
                      >
                        {busyKey === `remove:${item.id}` ? "Removing…" : "Remove from Library"}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
