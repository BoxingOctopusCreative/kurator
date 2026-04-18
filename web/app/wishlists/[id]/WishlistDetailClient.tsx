"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Heart } from "lucide-react";
import {
  CategoryMetadataFields,
  type CategoryFormSlice,
} from "@/components/CategoryMetadataFields";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { TitleMetadataSearch } from "@/components/TitleMetadataSearch";
import {
  createWishlistEntry,
  deleteWishlist,
  deleteWishlistEntry,
  fetchCollections,
  fetchWishlist,
  fetchWishlistEntries,
  obtainWishlistEntry,
  updateWishlist,
  type Category,
  type Wishlist,
  type WishlistEntry,
} from "@/lib/api";
import { categoryLabel } from "@/lib/categoryLabels";
import { buildItemMetadata } from "@/lib/itemMetadata";
import { getCoverArtUrl } from "@/lib/itemDisplay";
import {
  assertCollectionOrWishlistName,
  assertItemTitle,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";
import { useAuth } from "@/components/AuthProvider";

const categories: { value: Category; label: string }[] = [
  { value: "game", label: "Game" },
  { value: "music", label: "Music" },
  { value: "book", label: "Book" },
  { value: "video", label: "Video" },
  { value: "comic_book", label: "Comic book" },
  { value: "manga", label: "Manga" },
];

export function WishlistDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const idRaw = params.id;
  const id = typeof idRaw === "string" ? Number(idRaw) : NaN;

  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [collections, setCollections] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTarget, setEditTarget] = useState<number | "">("");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const [destCollectionId, setDestCollectionId] = useState<number | null>(null);

  const [addTitle, setAddTitle] = useState("");
  const [addCategory, setAddCategory] = useState<Category>("game");
  const [addSlice, setAddSlice] = useState<CategoryFormSlice>({});
  const [addStatus, setAddStatus] = useState<"idle" | "saving">("idle");
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const [obtainBusy, setObtainBusy] = useState<number | null>(null);

  const loadAll = useCallback(() => {
    if (!Number.isFinite(id) || id < 1) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchWishlist(id),
      fetchWishlistEntries(id),
      fetchCollections({ limit: 100, sort: "name_asc" }).then((r) =>
        r.items.map((c) => ({ id: c.id, name: c.name }))
      ),
    ])
      .then(([wl, ent, cols]) => {
        setWishlist(wl);
        setEntries(ent);
        setCollections(cols);
        setEditName(wl.name);
        setEditDesc(wl.description ?? "");
        setEditTarget(wl.target_collection_id ?? "");
        setEditIsPublic(wl.is_public !== false);
        if (wl.target_collection_id && cols.some((c) => c.id === wl.target_collection_id)) {
          setDestCollectionId(wl.target_collection_id);
        } else if (cols.length > 0) {
          setDestCollectionId(cols[0].id);
        } else {
          setDestCollectionId(null);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load wishlist."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function onSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(id) || id < 1 || !wishlist) return;
    setSettingsMsg(null);
    setSavingSettings(true);
    try {
      const name = assertCollectionOrWishlistName(editName, "Wishlist name");
      const descRaw = editDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(editDesc, LIMITS.description, "Description")
        : "";
      const updated = await updateWishlist(id, {
        name,
        description,
        target_collection_id:
          editTarget === "" || editTarget === 0 ? null : Number(editTarget),
        is_public: editIsPublic,
      });
      setWishlist(updated);
      setSettingsMsg("Saved.");
    } catch (err) {
      setSettingsMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function onDeleteWishlist() {
    if (!Number.isFinite(id) || id < 1) return;
    if (!window.confirm("Delete this wishlist and all wished items?")) return;
    try {
      await deleteWishlist(id);
      router.push("/wishlists");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function onAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(id) || id < 1) return;
    setAddMsg(null);
    setAddStatus("saving");
    try {
      const safeTitle = assertItemTitle(addTitle);
      const metadata = buildItemMetadata(addCategory, addSlice);
      await createWishlistEntry(id, {
        title: safeTitle,
        category: addCategory,
        metadata,
      });
      setAddTitle("");
      setAddSlice({});
      const ent = await fetchWishlistEntries(id);
      setEntries(ent);
      const wl = await fetchWishlist(id);
      setWishlist(wl);
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : "Could not add.");
    } finally {
      setAddStatus("idle");
    }
  }

  async function onObtain(entry: WishlistEntry) {
    if (!Number.isFinite(id) || id < 1) return;
    const cid = destCollectionId;
    if (cid == null || cid < 1) {
      setError("Choose a destination collection.");
      return;
    }
    setObtainBusy(entry.id);
    setError(null);
    try {
      await obtainWishlistEntry(id, entry.id, cid);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      const wl = await fetchWishlist(id);
      setWishlist(wl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to collection.");
    } finally {
      setObtainBusy(null);
    }
  }

  async function onRemoveEntry(entry: WishlistEntry) {
    if (!Number.isFinite(id) || id < 1) return;
    if (!window.confirm(`Remove “${entry.title}” from this wishlist?`)) return;
    try {
      await deleteWishlistEntry(id, entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      const wl = await fetchWishlist(id);
      setWishlist(wl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed.");
    }
  }

  if (!Number.isFinite(id) || id < 1) {
    return (
      <p className="text-sm text-red-400" role="alert">
        Invalid wishlist.
      </p>
    );
  }

  const isOwner =
    wishlist != null && user != null && Number(wishlist.user_id) === Number(user.id);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/wishlists"
        className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All wishlists
      </Link>

      {loading && <p className="text-sm text-kurator-muted">Loading…</p>}
      {error && !loading && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {!loading && wishlist && (
        <>
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-kurator-border/60 text-kurator-accent">
                <Heart className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">{wishlist.name}</h1>
                {wishlist.description && (
                  <p className="mt-2 text-sm text-kurator-muted">{wishlist.description}</p>
                )}
                <p className="mt-2 text-xs text-kurator-muted/80">
                  {wishlist.entry_count} {wishlist.entry_count === 1 ? "item" : "items"} wished
                  {wishlist.is_public === false ? (
                    <span className="ml-2 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                      Private
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                      Public
                    </span>
                  )}
                </p>
                {!isOwner && (
                  <p className="mt-2 text-xs text-kurator-muted">You’re viewing another member’s public list (read-only).</p>
                )}
              </div>
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={onDeleteWishlist}
                className="shrink-0 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"
              >
                Delete wishlist
              </button>
            )}
          </header>

          {isOwner && (
          <form
            onSubmit={onSaveSettings}
            className="mb-8 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 md:p-6"
          >
            <h2 className="text-sm font-medium text-kurator-fg">Wishlist settings</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-sm md:col-span-2">
                <span className="text-kurator-muted">Name</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="text-kurator-muted">Description</span>
                <input
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="text-kurator-muted">Linked collection</span>
                <select
                  className="mt-1 w-full max-w-md rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                  value={editTarget === "" ? "" : String(editTarget)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditTarget(v === "" ? "" : Number(v));
                  }}
                >
                  <option value="">None</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-kurator-muted">
                  Default shelf when you use “Add to collection” below (you can still pick another in the dropdown).
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-kurator-muted md:col-span-2">
                <input
                  type="checkbox"
                  checked={editIsPublic}
                  onChange={(e) => setEditIsPublic(e.target.checked)}
                  className="rounded border-kurator-border"
                />
                Public — other signed-in users can browse this list (read-only)
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingSettings}
                className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
              >
                {savingSettings ? "Saving…" : "Save settings"}
              </button>
              {settingsMsg && <p className="text-sm text-kurator-muted">{settingsMsg}</p>}
            </div>
          </form>
          )}

          {entries.length === 0 ? (
            <p className="mb-8 rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
              {isOwner
                ? "Nothing on this list yet. Add an item below."
                : "Nothing on this list yet."}
            </p>
          ) : (
            <>
              {isOwner && (
              <div className="mb-4 flex flex-col gap-3 rounded-xl border border-kurator-border bg-kurator-bg/40 p-4 sm:flex-row sm:items-end sm:justify-between">
                <label className="block min-w-0 flex-1 text-sm">
                  <span className="text-kurator-muted">Add to collection (destination)</span>
                  <select
                    className="mt-1 w-full max-w-md rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                    value={destCollectionId ?? ""}
                    onChange={(e) => setDestCollectionId(Number(e.target.value) || null)}
                    disabled={collections.length === 0}
                  >
                    {collections.length === 0 ? (
                      <option value="">No collections — create one under Collections</option>
                    ) : (
                      collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
              )}

              <ul className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((item) => {
                  const cover = getCoverArtUrl(item.metadata);
                  return (
                    <li key={item.id}>
                      <div className="flex h-full min-h-[280px] flex-col rounded-xl border border-kurator-border bg-kurator-surface shadow-sm">
                        <div className="shrink-0 space-y-2 p-4 pb-2">
                          <h2 className="line-clamp-2 text-base font-medium leading-snug text-kurator-fg">
                            {item.title}
                          </h2>
                          <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                            {categoryLabel(item.category)}
                          </span>
                        </div>
                        <div className="mt-auto flex flex-1 flex-col justify-end p-4 pt-2">
                          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg">
                            <ItemCoverImage
                              url={cover}
                              alt={`Cover for ${item.title}`}
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          </div>
                          {isOwner && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={
                                obtainBusy === item.id ||
                                destCollectionId == null ||
                                collections.length === 0
                              }
                              onClick={() => onObtain(item)}
                              className="flex-1 rounded-lg bg-kurator-accent px-3 py-2 text-center text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                            >
                              {obtainBusy === item.id ? "Adding…" : "Add to collection"}
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveEntry(item)}
                              className="rounded-lg border border-kurator-border px-3 py-2 text-xs text-kurator-muted hover:text-kurator-fg"
                            >
                              Remove
                            </button>
                          </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {isOwner && (
          <div className="rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 md:p-6">
            <h2 className="text-sm font-medium text-kurator-fg">Add to wishlist</h2>
            <form onSubmit={onAddEntry} className="mt-4 space-y-6">
              <label className="block text-sm">
                <span className="text-kurator-muted">Title</span>
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                />
              </label>

              <TitleMetadataSearch
                category={addCategory}
                title={addTitle}
                onApply={({ title: nextTitle, slice }) => {
                  if (nextTitle) setAddTitle(nextTitle);
                  setAddSlice((prev) => {
                    const merged: CategoryFormSlice = { ...prev };
                    for (const key of Object.keys(slice) as (keyof CategoryFormSlice)[]) {
                      const raw = slice[key];
                      if (raw === undefined || raw === null) continue;
                      if (key === "single_issue") {
                        if (typeof raw === "boolean") {
                          merged.single_issue = raw;
                          if (raw === false) merged.issue_number = "";
                        }
                        continue;
                      }
                      if (raw === "") continue;
                      const str = typeof raw === "string" ? raw : String(raw);
                      (merged as Record<string, string | boolean | undefined>)[key] = str;
                    }
                    return merged;
                  });
                }}
              />

              <label className="block text-sm">
                <span className="text-kurator-muted">Category</span>
                <select
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
                  value={addCategory}
                  onChange={(e) => {
                    setAddCategory(e.target.value as Category);
                    setAddSlice({});
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium text-kurator-muted">Category fields</p>
                <CategoryMetadataFields category={addCategory} values={addSlice} onChange={setAddSlice} />
              </div>

              {addMsg && (
                <p className="text-sm text-red-400" role="alert">
                  {addMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={addStatus === "saving"}
                className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
              >
                {addStatus === "saving" ? "Adding…" : "Add to wishlist"}
              </button>
            </form>
          </div>
          )}
        </>
      )}
    </div>
  );
}
