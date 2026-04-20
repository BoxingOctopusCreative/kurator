"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Download,
  LayoutGrid,
  List,
  Upload,
} from "lucide-react";
import type { Category, Collection, Item } from "@/lib/api";
import {
  deleteItem,
  exportCollectionItemsCsv,
  fetchCollection,
  fetchCollections,
  fetchItems,
  importCollectionItemsCsv,
  patchCollection,
  updateItem,
} from "@/lib/api";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";
import { useAuth } from "@/components/AuthProvider";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ItemStarRating } from "@/components/ItemStarRating";
import { categoryLabel } from "@/lib/categoryLabels";
import { getCoverArtUrl, getItemYear, itemMatchesSearch } from "@/lib/itemDisplay";

const VIEW_STORAGE_KEY = "kurator_collection_items_view";

const ALL_CATEGORIES: Category[] = ["game", "music", "book", "video", "comic_book", "manga"];

type ListSortKey = "title" | "category" | "rating" | "year";

function parseYearNum(item: Item): number | null {
  const y = getItemYear(item.metadata);
  if (!y) return null;
  const n = parseInt(y, 10);
  return Number.isFinite(n) ? n : null;
}

function parseRatingSort(item: Item): number {
  const r = item.rating;
  if (r == null || r < 1) return 0;
  return r;
}

function sortListItems(items: Item[], key: ListSortKey, dir: "asc" | "desc"): Item[] {
  const out = [...items];
  out.sort((a, b) => {
    if (key === "year") {
      const na = parseYearNum(a);
      const nb = parseYearNum(b);
      if (na === null && nb === null) {
        return Number(a.id) - Number(b.id);
      }
      if (na === null) return 1;
      if (nb === null) return -1;
      const diff = na - nb;
      if (diff !== 0) return dir === "asc" ? diff : -diff;
      return Number(a.id) - Number(b.id);
    }

    let cmp = 0;
    if (key === "title") {
      cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    } else if (key === "category") {
      cmp = a.category.localeCompare(b.category);
    } else if (key === "rating") {
      cmp = parseRatingSort(a) - parseRatingSort(b);
    }
    if (cmp !== 0) {
      return dir === "asc" ? cmp : -cmp;
    }
    return Number(a.id) - Number(b.id);
  });
  return out;
}

export function CollectionDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const idRaw = params.id;
  const id = typeof idRaw === "string" ? Number(idRaw) : NaN;

  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [viewMode, setViewMode] = useState<"list" | "tiles">("tiles");
  const [listSortKey, setListSortKey] = useState<ListSortKey>("title");
  const [listSortDir, setListSortDir] = useState<"asc" | "desc">("asc");
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [myCollections, setMyCollections] = useState<Collection[]>([]);
  const [shelfName, setShelfName] = useState("");
  const [shelfDesc, setShelfDesc] = useState("");
  const [shelfSaving, setShelfSaving] = useState(false);
  const [shelfMsg, setShelfMsg] = useState<string | null>(null);
  const [itemBusy, setItemBusy] = useState<{ id: number; op: "move" | "remove" } | null>(null);
  const [itemMsg, setItemMsg] = useState<string | null>(null);
  const [movePick, setMovePick] = useState<Record<number, number>>({});

  const isOwner =
    user &&
    collection?.user_id != null &&
    Number(collection.user_id) === Number(user.id);

  useEffect(() => {
    if (!collection) return;
    setShelfName(collection.name);
    setShelfDesc(collection.description ?? "");
  }, [collection]);

  useEffect(() => {
    if (!user || !collection || Number(collection.user_id) !== Number(user.id)) {
      setMyCollections([]);
      return;
    }
    let cancelled = false;
    fetchCollections({ limit: 200, sort: "name_asc" })
      .then((r) => {
        if (!cancelled) setMyCollections(r.items);
      })
      .catch(() => {
        if (!cancelled) setMyCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, collection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "list" || v === "tiles") setViewMode(v);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!Number.isFinite(id) || id < 1) {
      setError("Invalid collection.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchCollection(id), fetchItems({ collectionId: id, limit: 500 })])
      .then(([col, its]) => {
        if (!cancelled) {
          setCollection(col);
          setItems(its);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load collection.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function reloadCollectionData() {
    const [col, its] = await Promise.all([
      fetchCollection(id),
      fetchItems({ collectionId: id, limit: 500 }),
    ]);
    setCollection(col);
    setItems(its);
  }

  async function onExportCsv() {
    setImportMsg(null);
    try {
      const blob = await exportCollectionItemsCsv(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `collection-${id}-items.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Export failed.");
    }
  }

  function onImportPickClick() {
    importFileRef.current?.click();
  }

  async function onImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const res = await importCollectionItemsCsv(id, file);
      const parts = [`Created ${res.created}`, `updated ${res.updated}`];
      if (res.errors?.length) {
        parts.push(`${res.errors.length} row(s) skipped`);
        const preview = res.errors
          .slice(0, 5)
          .map((er) => `Row ${er.row}: ${er.error}`)
          .join("; ");
        parts.push(preview);
        if (res.errors.length > 5) {
          parts.push("…");
        }
      }
      setImportMsg(parts.join(" · "));
      await reloadCollectionData();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  async function onSaveShelfDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!collection) return;
    setShelfMsg(null);
    setShelfSaving(true);
    try {
      const name = assertCollectionOrWishlistName(shelfName, "Name");
      let description = "";
      const trimmed = shelfDesc.trim();
      if (trimmed) {
        description = assertLooseMultilineText(shelfDesc, LIMITS.description, "Description");
      }
      const updated = await patchCollection(collection.id, { name, description });
      setCollection(updated);
      setShelfMsg("Saved.");
    } catch (err) {
      setShelfMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setShelfSaving(false);
    }
  }

  async function onMoveItemToShelf(item: Item, targetCollectionId: number) {
    if (!Number.isFinite(targetCollectionId) || targetCollectionId < 1) {
      setItemMsg("Pick a collection.");
      return;
    }
    if (targetCollectionId === item.collection_id) {
      setItemMsg("Choose a different shelf than this one.");
      return;
    }
    setItemMsg(null);
    setItemBusy({ id: item.id, op: "move" });
    try {
      await updateItem(item.id, {
        title: item.title,
        category: item.category,
        metadata: item.metadata,
        collection_id: targetCollectionId,
      });
      await reloadCollectionData();
    } catch (err) {
      setItemMsg(err instanceof Error ? err.message : "Could not move item.");
    } finally {
      setItemBusy(null);
    }
  }

  async function onRemoveItemForever(item: Item) {
    if (!window.confirm(`Remove “${item.title}” permanently? This cannot be undone.`)) return;
    setItemMsg(null);
    setItemBusy({ id: item.id, op: "remove" });
    try {
      await deleteItem(item.id);
      await reloadCollectionData();
    } catch (err) {
      setItemMsg(err instanceof Error ? err.message : "Could not remove item.");
    } finally {
      setItemBusy(null);
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      return itemMatchesSearch(item, search);
    });
  }, [items, search, categoryFilter]);

  const listOrderedItems = useMemo(() => {
    if (viewMode !== "list") return filteredItems;
    return sortListItems(filteredItems, listSortKey, listSortDir);
  }, [filteredItems, viewMode, listSortKey, listSortDir]);

  const moveTargets = useMemo(
    () => (collection ? myCollections.filter((c) => c.id !== collection.id) : []),
    [myCollections, collection]
  );

  function toggleListSort(key: ListSortKey) {
    if (listSortKey === key) {
      setListSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setListSortKey(key);
      setListSortDir("asc");
    }
  }

  if (!Number.isFinite(id) || id < 1) {
    return (
      <p className="text-sm text-red-400" role="alert">
        Invalid collection.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/collections"
        className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All collections
      </Link>

      {loading && <p className="text-sm text-kurator-muted">Loading…</p>}

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && collection && (
        <>
          <header className="mb-6">
            <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">{collection.name}</h1>
            {collection.description && (
              <p className="mt-2 text-sm text-kurator-muted">{collection.description}</p>
            )}
            <p className="mt-2 text-xs text-kurator-muted/80">
              {collection.item_count} {collection.item_count === 1 ? "item" : "items"}
              {collection.is_public === false && (
                <span className="ml-2 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                  Private
                </span>
              )}
            </p>
            {isOwner && (
              <div className="mt-4 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4">
                <p className="text-sm font-medium text-kurator-fg">Visibility</p>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-kurator-muted">
                  <input
                    type="checkbox"
                    checked={collection.is_public !== false}
                    disabled={privacySaving}
                    onChange={async (e) => {
                      const is_public = e.target.checked;
                      setPrivacyMsg(null);
                      setPrivacySaving(true);
                      try {
                        const updated = await patchCollection(collection.id, { is_public });
                        setCollection(updated);
                      } catch (err) {
                        setPrivacyMsg(err instanceof Error ? err.message : "Could not update.");
                      } finally {
                        setPrivacySaving(false);
                      }
                    }}
                    className="rounded-sm border-kurator-border"
                  />
                  {collection.is_public !== false ? "Public — listed for others and followers" : "Private — only you can open this shelf"}
                </label>
                {privacyMsg && (
                  <p className="mt-2 text-sm text-amber-200/90" role="status">
                    {privacyMsg}
                  </p>
                )}
              </div>
            )}
            {isOwner && (
              <form
                onSubmit={onSaveShelfDetails}
                className="mt-4 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4"
              >
                <p className="text-sm font-medium text-kurator-fg">Shelf name &amp; description</p>
                <label className="mt-3 block text-sm">
                  <span className="text-kurator-muted">Name</span>
                  <input
                    value={shelfName}
                    onChange={(e) => setShelfName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                    autoComplete="off"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  <span className="text-kurator-muted">Description</span>
                  <textarea
                    value={shelfDesc}
                    onChange={(e) => setShelfDesc(e.target.value)}
                    rows={3}
                    className="mt-1 w-full resize-y rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={shelfSaving}
                    className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                  >
                    {shelfSaving ? "Saving…" : "Save shelf details"}
                  </button>
                  {shelfMsg && (
                    <p className="text-sm text-kurator-muted" role="status">
                      {shelfMsg}
                    </p>
                  )}
                </div>
              </form>
            )}
            {isOwner && itemMsg && (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100/90" role="alert">
                {itemMsg}
              </p>
            )}
            {isOwner && (
              <div className="mt-4 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4">
                <p className="text-sm font-medium text-kurator-fg">Import &amp; export</p>
                <p className="mt-1 text-xs text-kurator-muted">
                  Spreadsheet columns: title, category, optional id (to update an item already on this shelf), and
                  extra fields in one column.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onExportCsv()}
                    className="inline-flex items-center gap-2 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg hover:border-kurator-accent/50"
                  >
                    <Download className="h-4 w-4 shrink-0" aria-hidden />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={onImportPickClick}
                    disabled={importBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 shrink-0" aria-hidden />
                    {importBusy ? "Importing…" : "Import CSV"}
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    aria-hidden
                    tabIndex={-1}
                    onChange={onImportFileChange}
                  />
                </div>
                {importMsg && (
                  <p className="mt-2 text-sm text-kurator-muted" role="status">
                    {importMsg}
                  </p>
                )}
              </div>
            )}
          </header>

          {items.length === 0 ? (
            <p className="rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
              No items in this collection yet.{" "}
              <Link href="/items/add" className="text-kurator-accent hover:underline">
                Add an item
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="mb-6 flex flex-col gap-4 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 lg:flex-row lg:items-end lg:justify-between">
                <label className="block min-w-0 flex-1 text-sm">
                  <span className="text-kurator-muted">Search</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search titles…"
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                    autoComplete="off"
                  />
                </label>
                <label className="block w-full min-w-[160px] text-sm lg:max-w-xs">
                  <span className="text-kurator-muted">Category</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value === "all" ? "all" : (e.target.value as Category))
                    }
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  >
                    <option value="all">All categories</option>
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {categoryLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex shrink-0 items-center gap-1 rounded-lg border border-kurator-border bg-kurator-bg p-1">
                  <span className="sr-only">Layout</span>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    aria-pressed={viewMode === "list"}
                    title="List view"
                    className={`rounded-md p-2 ${viewMode === "list" ? "bg-kurator-accent text-kurator-onAccent" : "text-kurator-muted hover:text-kurator-fg"}`}
                  >
                    <List className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("tiles")}
                    aria-pressed={viewMode === "tiles"}
                    title="Tile view"
                    className={`rounded-md p-2 ${viewMode === "tiles" ? "bg-kurator-accent text-kurator-onAccent" : "text-kurator-muted hover:text-kurator-fg"}`}
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <p className="rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
                  No items match your search or filter.
                </p>
              ) : viewMode === "list" ? (
                <div className="overflow-x-auto rounded-xl border border-kurator-border">
                  <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-kurator-border bg-kurator-surface/80 text-xs uppercase tracking-wide text-kurator-muted">
                        <th scope="col" className="w-24 px-3 py-3 font-medium">
                          Cover
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3"
                          aria-sort={
                            listSortKey === "title"
                              ? listSortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleListSort("title")}
                            className="inline-flex items-center gap-1.5 font-medium text-kurator-muted hover:text-kurator-fg"
                          >
                            Title
                            {listSortKey === "title" ? (
                              listSortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5 shrink-0 text-kurator-accent" aria-hidden />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-kurator-accent" aria-hidden />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
                            )}
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="w-40 px-3 py-3"
                          aria-sort={
                            listSortKey === "category"
                              ? listSortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleListSort("category")}
                            className="inline-flex items-center gap-1.5 font-medium text-kurator-muted hover:text-kurator-fg"
                          >
                            Category
                            {listSortKey === "category" ? (
                              listSortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5 shrink-0 text-kurator-accent" aria-hidden />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-kurator-accent" aria-hidden />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
                            )}
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="w-36 px-3 py-3"
                          aria-sort={
                            listSortKey === "rating"
                              ? listSortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleListSort("rating")}
                            className="inline-flex items-center gap-1.5 font-medium text-kurator-muted hover:text-kurator-fg"
                          >
                            Rating
                            {listSortKey === "rating" ? (
                              listSortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5 shrink-0 text-kurator-accent" aria-hidden />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-kurator-accent" aria-hidden />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
                            )}
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="w-28 px-3 py-3"
                          aria-sort={
                            listSortKey === "year"
                              ? listSortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleListSort("year")}
                            className="inline-flex items-center gap-1.5 font-medium text-kurator-muted hover:text-kurator-fg"
                          >
                            Year
                            {listSortKey === "year" ? (
                              listSortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5 shrink-0 text-kurator-accent" aria-hidden />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-kurator-accent" aria-hidden />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
                            )}
                          </button>
                        </th>
                        {isOwner && (
                          <th
                            scope="col"
                            className="w-52 px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-kurator-muted"
                          >
                            Manage
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {listOrderedItems.map((item) => {
                        const cover = getCoverArtUrl(item.metadata);
                        const year = getItemYear(item.metadata);
                        return (
                          <tr
                            key={item.id}
                            tabIndex={0}
                            role="link"
                            aria-label={`View ${item.title}`}
                            className="cursor-pointer border-b border-kurator-border/80 last:border-0 hover:bg-kurator-surface/40 focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kurator-accent"
                            onClick={() => router.push(`/items/${item.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                router.push(`/items/${item.id}`);
                              }
                            }}
                          >
                            <td className="align-top px-3 py-3">
                              <div className="h-20 w-16 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg">
                                <ItemCoverImage
                                  url={cover}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </td>
                            <td className="align-top px-3 py-3 font-medium text-kurator-fg">{item.title}</td>
                            <td className="align-top px-3 py-3">
                              <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                                {categoryLabel(item.category)}
                              </span>
                            </td>
                            <td className="align-top px-3 py-3">
                              <ItemStarRating value={item.rating ?? null} size="sm" />
                            </td>
                            <td className="align-top px-3 py-3 text-kurator-muted">{year || "—"}</td>
                            {isOwner && (
                              <td
                                className="align-top px-3 py-3 text-right"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                {moveTargets.length > 0 ? (
                                  <div className="flex flex-col items-stretch gap-2 sm:inline-flex sm:flex-row sm:items-center sm:justify-end">
                                    <select
                                      aria-label={`Move “${item.title}” to another shelf`}
                                      className="max-w-44 rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg"
                                      value={String(movePick[item.id] ?? "")}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setMovePick((m) => ({
                                          ...m,
                                          [item.id]: v === "" ? 0 : Number(v),
                                        }));
                                      }}
                                    >
                                      <option value="">Move to…</option>
                                      {moveTargets.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={
                                        itemBusy?.id === item.id ||
                                        !movePick[item.id] ||
                                        movePick[item.id] === item.collection_id
                                      }
                                      onClick={() =>
                                        void onMoveItemToShelf(item, movePick[item.id] ?? 0)
                                      }
                                      className="rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
                                    >
                                      {itemBusy?.id === item.id && itemBusy.op === "move"
                                        ? "Moving…"
                                        : "Move"}
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-kurator-muted">No other shelf</span>
                                )}
                                <button
                                  type="button"
                                  disabled={itemBusy?.id === item.id}
                                  onClick={() => void onRemoveItemForever(item)}
                                  className="mt-2 block w-full rounded-lg border border-red-500/35 px-2 py-1.5 text-xs text-red-200/90 hover:bg-red-500/10 disabled:opacity-50 sm:mt-0 sm:ml-2 sm:inline sm:w-auto"
                                >
                                  {itemBusy?.id === item.id && itemBusy.op === "remove"
                                    ? "Removing…"
                                    : "Remove"}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredItems.map((item) => {
                    const cover = getCoverArtUrl(item.metadata);
                    return (
                      <li key={item.id}>
                        <div className="flex h-full min-h-[280px] flex-col rounded-xl border border-kurator-border bg-kurator-surface shadow-xs outline-hidden ring-kurator-accent transition hover:border-kurator-accent/40 focus-within:ring-2">
                          <Link
                            href={`/items/${item.id}`}
                            className="group flex flex-1 flex-col focus-visible:outline-hidden"
                          >
                            <div className="shrink-0 space-y-2 p-4 pb-2">
                              <h2 className="line-clamp-2 text-base font-medium leading-snug text-kurator-fg group-hover:text-kurator-accent">
                                {item.title}
                              </h2>
                              <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                                {categoryLabel(item.category)}
                              </span>
                              <div className="mt-1.5">
                                <ItemStarRating value={item.rating ?? null} size="sm" />
                              </div>
                            </div>
                            <div className="mt-auto flex flex-1 flex-col justify-end p-4 pt-2">
                              <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg">
                                <ItemCoverImage
                                  url={cover}
                                  alt={`Cover for ${item.title}`}
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              </div>
                            </div>
                          </Link>
                          {isOwner && (
                            <div className="border-t border-kurator-border/80 p-3">
                              {moveTargets.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                  <select
                                    aria-label={`Move “${item.title}” to another shelf`}
                                    className="w-full rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg"
                                    value={String(movePick[item.id] ?? "")}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setMovePick((m) => ({
                                        ...m,
                                        [item.id]: v === "" ? 0 : Number(v),
                                      }));
                                    }}
                                  >
                                    <option value="">Move to…</option>
                                    {moveTargets.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={
                                      itemBusy?.id === item.id ||
                                      !movePick[item.id] ||
                                      movePick[item.id] === item.collection_id
                                    }
                                    onClick={() => void onMoveItemToShelf(item, movePick[item.id] ?? 0)}
                                    className="rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
                                  >
                                    {itemBusy?.id === item.id && itemBusy.op === "move"
                                      ? "Moving…"
                                      : "Move to shelf"}
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-kurator-muted">Create another collection to move items.</p>
                              )}
                              <button
                                type="button"
                                disabled={itemBusy?.id === item.id}
                                onClick={() => void onRemoveItemForever(item)}
                                className="mt-2 w-full rounded-lg border border-red-500/35 px-2 py-1.5 text-xs text-red-200/90 hover:bg-red-500/10 disabled:opacity-50"
                              >
                                {itemBusy?.id === item.id && itemBusy.op === "remove"
                                  ? "Removing…"
                                  : "Remove from library"}
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
