"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  CircleHelp,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type {
  Category,
  Collection,
  ConsumptionStatus,
  Item,
  PublicUser,
  Visibility,
} from "@/lib/api";
import {
  DEFAULT_VISIBILITY,
  deleteItem,
  exportCollectionItemsCsv,
  fetchCollection,
  fetchCollections,
  fetchItems,
  fetchMyFriends,
  importCollectionItemsCsv,
  patchCollection,
  requestShelfJoin,
  updateItem,
  visibilityLabel,
  visibilityOf,
} from "@/lib/api";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";
import { useAuth } from "@/components/AuthProvider";
import { CollectionAddItemModal } from "@/components/CollectionAddItemModal";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { EditItemModal } from "@/components/EditItemModal";
import { CoverArtField } from "@/components/CoverArtField";
import { DeleteCollectionDialog } from "@/components/DeleteCollectionDialog";
import { WishlistSettingsModal } from "@/components/WishlistSettingsModal";
import { VisibilitySelect } from "@/components/VisibilitySelect";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { ItemStarRating } from "@/components/ItemStarRating";
import { MarkdownBody } from "@/components/MarkdownBody";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import { categoryLabel } from "@/lib/categoryLabels";
import {
  consumptionBadgeText,
  normalizeConsumptionStatus,
} from "@/lib/consumptionLabels";
import { isEntityUuid } from "@/lib/entityId";
import {
  getCoverArtUrl,
  getItemFormatColumnLabel,
  getItemYear,
  itemMatchesSearch,
} from "@/lib/itemDisplay";

const VIEW_STORAGE_KEY = "kurator_collection_items_view";

const ALL_CATEGORIES: Category[] = [
  "game",
  "music",
  "book",
  "movies",
  "tv",
  "anime",
  "comic_book",
  "manga",
];

type ListSortKey = "title" | "category" | "format" | "rating" | "year";

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

function parseFormatSortKey(item: Item): string {
  return getItemFormatColumnLabel(item).toLowerCase();
}

function sortListItems(
  items: Item[],
  key: ListSortKey,
  dir: "asc" | "desc",
): Item[] {
  const out = [...items];
  out.sort((a, b) => {
    if (key === "year") {
      const na = parseYearNum(a);
      const nb = parseYearNum(b);
      if (na === null && nb === null) {
        return a.id.localeCompare(b.id);
      }
      if (na === null) return 1;
      if (nb === null) return -1;
      const diff = na - nb;
      if (diff !== 0) return dir === "asc" ? diff : -diff;
      return a.id.localeCompare(b.id);
    }

    if (key === "format") {
      const fa = parseFormatSortKey(a);
      const fb = parseFormatSortKey(b);
      if (!fa && !fb) {
        return a.id.localeCompare(b.id);
      }
      if (!fa) return 1;
      if (!fb) return -1;
      const diff = fa.localeCompare(fb);
      if (diff !== 0) return dir === "asc" ? diff : -diff;
      return a.id.localeCompare(b.id);
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
    return a.id.localeCompare(b.id);
  });
  return out;
}

export function CollectionDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const idRaw = params.id;
  const id =
    typeof idRaw === "string" && isEntityUuid(idRaw) ? idRaw.trim() : "";

  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [consumptionFilter, setConsumptionFilter] = useState<
    "all" | ConsumptionStatus
  >("all");
  const [viewMode, setViewMode] = useState<"list" | "tiles">("list");
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
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descFocusTick, setDescFocusTick] = useState(0);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [itemBusy, setItemBusy] = useState<{
    id: string;
    op: "move" | "remove";
  } | null>(null);
  const [itemMsg, setItemMsg] = useState<string | null>(null);
  const [movePick, setMovePick] = useState<Record<string, string>>({});
  const [deleteShelfOpen, setDeleteShelfOpen] = useState(false);
  const [collectionSettingsModalOpen, setCollectionSettingsModalOpen] =
    useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
  const [joinShelfMsg, setJoinShelfMsg] = useState<string | null>(null);
  const [joinShelfBusy, setJoinShelfBusy] = useState(false);

  const [shareFriends, setShareFriends] = useState<PublicUser[]>([]);
  const [shareFriendsLoading, setShareFriendsLoading] = useState(false);
  const [shareInviteIds, setShareInviteIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [shareToggleBusy, setShareToggleBusy] = useState(false);
  const [shareInviteBusy, setShareInviteBusy] = useState(false);
  const [shareShelfMsg, setShareShelfMsg] = useState<string | null>(null);

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
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingDesc) setDescFocusTick((n) => n + 1);
  }, [editingDesc]);

  useEffect(() => {
    if (
      !user ||
      !collection ||
      Number(collection.user_id) !== Number(user.id)
    ) {
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
    if (!collectionSettingsModalOpen || !user) return;
    let cancelled = false;
    setShareFriendsLoading(true);
    fetchMyFriends({ limit: 200 })
      .then((r) => {
        if (!cancelled) setShareFriends(r.items);
      })
      .catch(() => {
        if (!cancelled) setShareFriends([]);
      })
      .finally(() => {
        if (!cancelled) setShareFriendsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionSettingsModalOpen, user]);

  useEffect(() => {
    if (!collectionSettingsModalOpen) {
      setShareInviteIds(new Set());
      setShareShelfMsg(null);
    }
  }, [collectionSettingsModalOpen]);

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
    if (!id) {
      setError("Invalid collection.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCollection(id),
      fetchItems({
        collectionId: id,
        limit: 500,
        consumptionStatus:
          consumptionFilter === "all" ? "all" : consumptionFilter,
      }),
    ])
      .then(([col, its]) => {
        if (!cancelled) {
          setCollection(col);
          setItems(its);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not load collection.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, consumptionFilter]);

  async function reloadCollectionData() {
    const [col, its] = await Promise.all([
      fetchCollection(id),
      fetchItems({
        collectionId: id,
        limit: 500,
        consumptionStatus:
          consumptionFilter === "all" ? "all" : consumptionFilter,
      }),
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

  function cancelTitleEdit() {
    if (!collection) return;
    setShelfName(collection.name);
    setEditingTitle(false);
    setShelfMsg(null);
  }

  function cancelDescEdit() {
    if (!collection) return;
    setShelfDesc(collection.description ?? "");
    setEditingDesc(false);
    setShelfMsg(null);
  }

  async function commitTitleEdit() {
    if (!collection || !isOwner) return;
    const trimmed = shelfName.trim();
    if (trimmed === collection.name.trim()) {
      setEditingTitle(false);
      return;
    }
    setShelfMsg(null);
    setShelfSaving(true);
    try {
      const name = assertCollectionOrWishlistName(shelfName, "Name");
      const updated = await patchCollection(collection.id, { name });
      setCollection(updated);
      setShelfName(updated.name);
      setEditingTitle(false);
      setShelfMsg("Saved.");
    } catch (err) {
      setShelfMsg(err instanceof Error ? err.message : "Could not save name.");
      setShelfName(collection.name);
      setEditingTitle(false);
    } finally {
      setShelfSaving(false);
    }
  }

  async function saveCoverArt(url: string) {
    if (!collection || !isOwner) return;
    setShelfMsg(null);
    setShelfSaving(true);
    try {
      const updated = await patchCollection(collection.id, {
        cover_art_url: url,
      });
      setCollection(updated);
      setShelfMsg("Cover saved.");
    } catch (err) {
      setShelfMsg(err instanceof Error ? err.message : "Could not save cover.");
    } finally {
      setShelfSaving(false);
    }
  }

  async function commitDescEdit(opts?: { keepEditing?: boolean }) {
    if (!collection || !isOwner) return;
    const trimmed = shelfDesc.trim();
    const current = (collection.description ?? "").trim();
    if (trimmed === current) {
      if (!opts?.keepEditing) setEditingDesc(false);
      return;
    }
    setShelfMsg(null);
    setShelfSaving(true);
    try {
      let description = "";
      if (trimmed) {
        description = assertLooseMultilineText(
          shelfDesc,
          LIMITS.description,
          "Description",
        );
      }
      const updated = await patchCollection(collection.id, { description });
      setCollection(updated);
      setShelfDesc(updated.description ?? "");
      if (!opts?.keepEditing) {
        setEditingDesc(false);
      }
      setShelfMsg("Saved.");
      if (opts?.keepEditing) {
        requestAnimationFrame(() => setDescFocusTick((n) => n + 1));
      }
    } catch (err) {
      setShelfMsg(
        err instanceof Error ? err.message : "Could not save description.",
      );
      setShelfDesc(collection.description ?? "");
      setEditingDesc(false);
    } finally {
      setShelfSaving(false);
    }
  }

  async function onMoveItemToShelf(item: Item, targetCollectionId: string) {
    const tid = targetCollectionId.trim();
    if (!tid) {
      setItemMsg("Pick a collection.");
      return;
    }
    if (tid === item.collection_id) {
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
        collection_id: tid,
        consumption_status: normalizeConsumptionStatus(item),
      });
      await reloadCollectionData();
    } catch (err) {
      setItemMsg(err instanceof Error ? err.message : "Could not move item.");
    } finally {
      setItemBusy(null);
    }
  }

  async function onRemoveItemForever(item: Item) {
    if (
      !window.confirm(
        `Remove “${item.title}” permanently? This cannot be undone.`,
      )
    )
      return;
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
      if (categoryFilter !== "all" && item.category !== categoryFilter)
        return false;
      const st = normalizeConsumptionStatus(item);
      if (consumptionFilter !== "all" && st !== consumptionFilter) return false;
      return itemMatchesSearch(item, search);
    });
  }, [items, search, categoryFilter, consumptionFilter]);

  const listOrderedItems = useMemo(() => {
    if (viewMode !== "list") return filteredItems;
    return sortListItems(filteredItems, listSortKey, listSortDir);
  }, [filteredItems, viewMode, listSortKey, listSortDir]);

  const moveTargets = useMemo(
    () =>
      collection ? myCollections.filter((c) => c.id !== collection.id) : [],
    [myCollections, collection],
  );

  function toggleListSort(key: ListSortKey) {
    if (listSortKey === key) {
      setListSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setListSortKey(key);
      setListSortDir("asc");
    }
  }

  if (!id) {
    return (
      <p className="text-sm text-red-400" role="alert">
        Invalid collection.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {collection == null ? (
        <Link
          href="/collections"
          className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All collections
        </Link>
      ) : null}

      {loading && <p className="text-sm text-kurator-muted">Loading…</p>}

      {error && (
        <p
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {!loading && !error && collection && (
        <>
          <DeleteCollectionDialog
            collection={{
              id: collection.id,
              name: collection.name,
              item_count: collection.item_count,
            }}
            open={deleteShelfOpen}
            onOpenChange={setDeleteShelfOpen}
            onDeleted={() => router.push("/collections")}
          />
          {isOwner && (
            <CollectionAddItemModal
              open={addItemModalOpen}
              onOpenChange={setAddItemModalOpen}
              collectionId={collection.id}
              collectionCategory={collection.category ?? null}
              onCreated={() => void reloadCollectionData()}
            />
          )}
          {isOwner && (
            <EditItemModal
              open={itemToEdit != null}
              onOpenChange={(open) => {
                if (!open) setItemToEdit(null);
              }}
              item={itemToEdit}
              collectionCategory={collection.category ?? null}
              onSaved={() => void reloadCollectionData()}
            />
          )}
          {isOwner && (
            <WishlistSettingsModal
              open={collectionSettingsModalOpen}
              onOpenChange={setCollectionSettingsModalOpen}
              title="Collection settings"
              titleId="collection-settings-dialog-title"
            >
              <div className="space-y-6">
                <div className="rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
                  <p className="mb-3 text-sm font-medium text-kurator-fg">Cover art</p>
                  <CoverArtField
                    value={collection.cover_art_url ?? ""}
                    onChange={(url) => void saveCoverArt(url)}
                    disabled={shelfSaving}
                  />
                </div>

                <div className="rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
                  <VisibilitySelect
                    name="collection-settings-visibility"
                    legend="Visibility"
                    value={visibilityOf(collection) ?? DEFAULT_VISIBILITY}
                    disabled={privacySaving}
                    onChange={async (next: Visibility) => {
                      setPrivacyMsg(null);
                      setPrivacySaving(true);
                      try {
                        const updated = await patchCollection(collection.id, {
                          visibility: next,
                          is_public: next !== "private",
                        });
                        setCollection(updated);
                      } catch (err) {
                        setPrivacyMsg(
                          err instanceof Error
                            ? err.message
                            : "Could not update.",
                        );
                      } finally {
                        setPrivacySaving(false);
                      }
                    }}
                  />
                  {privacyMsg && (
                    <p className="mt-2 text-sm text-amber-200/90" role="status">
                      {privacyMsg}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-fg">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!collection.is_shared}
                      disabled={shareToggleBusy}
                      onChange={async (e) => {
                        if (!collection) return;
                        setShareShelfMsg(null);
                        setShareToggleBusy(true);
                        try {
                          const updated = await patchCollection(collection.id, {
                            is_shared: e.target.checked,
                          });
                          setCollection(updated);
                          if (!e.target.checked) setShareInviteIds(new Set());
                        } catch (err) {
                          setShareShelfMsg(
                            err instanceof Error
                              ? err.message
                              : "Could not update sharing.",
                          );
                        } finally {
                          setShareToggleBusy(false);
                        }
                      }}
                    />
                    <span>
                      <span className="font-medium">Shared collection</span>
                      <span className="mt-0.5 block text-xs text-kurator-muted">
                        Collaborators you approve can add and edit items. Others
                        can request to join from this page.
                      </span>
                    </span>
                  </label>
                  {collection.is_shared ? (
                    <div className="mt-4 border-t border-kurator-border/60 pt-4">
                      <p className="text-xs font-medium text-kurator-muted">
                        Invite mutual friends (optional)
                      </p>
                      {shareFriendsLoading ? (
                        <p className="mt-2 text-xs text-kurator-muted">
                          Loading friends…
                        </p>
                      ) : shareFriends.length === 0 ? (
                        <p className="mt-2 text-xs text-kurator-muted">
                          No mutual friends to show. Follow people who follow you
                          back.
                        </p>
                      ) : (
                        <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-md border border-kurator-border/80 p-2">
                          {shareFriends.map((f) => (
                            <li key={f.id}>
                              <label className="flex cursor-pointer items-center gap-2 text-xs text-kurator-fg">
                                <input
                                  type="checkbox"
                                  checked={shareInviteIds.has(f.id)}
                                  onChange={() => {
                                    setShareInviteIds((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(f.id)) n.delete(f.id);
                                      else n.add(f.id);
                                      return n;
                                    });
                                  }}
                                />
                                @{f.username}
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        disabled={shareInviteBusy || shareInviteIds.size === 0}
                        onClick={async () => {
                          if (!collection) return;
                          const ids = Array.from(shareInviteIds);
                          if (ids.length === 0) return;
                          setShareShelfMsg(null);
                          setShareInviteBusy(true);
                          try {
                            const updated = await patchCollection(
                              collection.id,
                              { invite_user_ids: ids },
                            );
                            setCollection(updated);
                            setShareInviteIds(new Set());
                            setShareShelfMsg("Invite requests sent.");
                          } catch (err) {
                            setShareShelfMsg(
                              err instanceof Error
                                ? err.message
                                : "Could not send invites.",
                            );
                          } finally {
                            setShareInviteBusy(false);
                          }
                        }}
                        className="mt-3 rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                      >
                        {shareInviteBusy ? "Sending…" : "Send invite requests"}
                      </button>
                    </div>
                  ) : null}
                  {shareShelfMsg && (
                    <p className="mt-2 text-sm text-amber-200/90" role="status">
                      {shareShelfMsg}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
                  <div className="group relative inline-flex items-center gap-1.5">
                    <p className="text-sm font-medium text-kurator-fg">
                      Import &amp; Export
                    </p>
                    <button
                      type="button"
                      className="-m-0.5 inline-flex shrink-0 rounded-sm p-0.5 text-kurator-muted hover:text-kurator-fg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                      aria-label="Spreadsheet columns: title, category, optional id (to update an item already on this shelf), optional rating and consumption_status (pending or done), and extra fields in one column."
                    >
                      <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span
                      role="tooltip"
                      className="pointer-events-none invisible absolute bottom-full left-0 z-60 mb-1.5 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                    >
                      Spreadsheet columns: title, category, optional id (to
                      update an item already on this shelf), optional rating and
                      consumption_status (pending or done), and extra fields in
                      one column.
                    </span>
                  </div>
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
                    <p
                      className="mt-2 text-sm text-kurator-muted"
                      role="status"
                    >
                      {importMsg}
                    </p>
                  )}
                </div>
              </div>
            </WishlistSettingsModal>
          )}
          <header className="mb-6 flex flex-col gap-6">
            <PageHeroUnsplash
              bleedBottomMargin={false}
              customBackgroundUrl={(collection.cover_art_url ?? "").trim() || null}
            >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                {isOwner ? (
                  editingTitle ? (
                    <div className="max-w-3xl">
                      <input
                        ref={titleInputRef}
                        value={shelfName}
                        onChange={(e) => setShelfName(e.target.value)}
                        onBlur={() => void commitTitleEdit()}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelTitleEdit();
                          } else if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void commitTitleEdit();
                          }
                        }}
                        disabled={shelfSaving}
                        className="w-full rounded-lg border border-kurator-accent bg-kurator-bg px-3 py-2 text-2xl font-semibold text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 md:text-3xl"
                        aria-label="Collection name"
                        autoComplete="off"
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-kurator-muted">
                          Enter saves · Esc cancels · leaving the field saves if
                          the name changed
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={shelfSaving}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void commitTitleEdit()}
                            className="rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                          >
                            {shelfSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            disabled={shelfSaving}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => cancelTitleEdit()}
                            className="rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-sm text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingTitle(true)}
                      disabled={shelfSaving}
                      className="group flex max-w-full items-start gap-2 rounded-lg text-left text-2xl font-semibold text-kurator-fg outline-hidden ring-kurator-accent hover:bg-kurator-border/40 focus-visible:ring-2 disabled:opacity-50 md:text-3xl"
                    >
                      <span className="min-w-0 wrap-break-word">
                        {collection.name}
                      </span>
                      <Pencil
                        className="mt-1.5 h-5 w-5 shrink-0 text-kurator-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:mt-2 md:h-6 md:w-6"
                        aria-hidden
                      />
                      <span className="sr-only">Edit name</span>
                    </button>
                  )
                ) : (
                  <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">{collection.name}</h1>
                )}

                {isOwner ? (
                  editingDesc ? (
                    <div className="mt-3 max-w-3xl">
                      <MarkdownRichEditor
                        value={shelfDesc}
                        onChange={setShelfDesc}
                        variant="full"
                        disabled={shelfSaving}
                        focusTick={descFocusTick}
                        aria-label="Collection description"
                        placeholder="Describe this shelf…"
                        className="border-kurator-accent ring-kurator-accent"
                        onBlurShell={() => void commitDescEdit()}
                        onSaveChord={() => void commitDescEdit({ keepEditing: true })}
                        onCancelChord={() => cancelDescEdit()}
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-kurator-muted">
                          ⌘ or Ctrl+Enter saves and keeps you here · Esc cancels
                          · Blur or Save closes the editor
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={shelfSaving}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void commitDescEdit()}
                            className="rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                          >
                            {shelfSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            disabled={shelfSaving}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => cancelDescEdit()}
                            className="rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-sm text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDesc(true)}
                      disabled={shelfSaving}
                      className="group mt-2 flex w-fit max-w-3xl items-start gap-2 rounded-lg text-left outline-hidden ring-kurator-accent hover:bg-kurator-border/40 focus-visible:ring-2 disabled:opacity-50"
                    >
                      <span className="min-w-0 text-left text-sm leading-relaxed text-kurator-muted group-hover:text-kurator-fg/90">
                        {(collection.description ?? "").trim() ? (
                          <MarkdownBody markdown={collection.description ?? ""} />
                        ) : (
                          <span className="italic">Add a description…</span>
                        )}
                      </span>
                      <Pencil
                        className="mt-1 h-4 w-4 shrink-0 text-kurator-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden
                      />
                      <span className="sr-only">Edit description</span>
                    </button>
                  )
                ) : (
                  collection.description?.trim() && (
                    <div className="mt-2 max-w-3xl text-sm text-kurator-muted">
                      <MarkdownBody markdown={collection.description} />
                    </div>
                  )
                )}

                <p className="mt-2 text-xs text-kurator-muted">
                  Shelf Type:{" "}
                  {collection.category ? (
                    <span className="font-medium text-kurator-fg">
                      {categoryLabel(collection.category)}
                    </span>
                  ) : (
                    <span className="text-kurator-fg/90">
                      any category (first item pins this shelf)
                    </span>
                  )}
                </p>
                {collection.author ? (
                  <div className="mt-2">
                    <ShelfAuthorLink author={collection.author} variant="avatarAndName" />
                  </div>
                ) : null}

                {!isOwner &&
                  user &&
                  collection.is_shared && (
                    <div className="mt-3 rounded-lg border border-kurator-border/80 bg-kurator-bg/40 px-3 py-2">
                      <p className="text-xs text-kurator-muted">
                        This is a shared collection. Ask the owner to add you as a collaborator.
                      </p>
                      <button
                        type="button"
                        disabled={joinShelfBusy}
                        onClick={async () => {
                          setJoinShelfMsg(null);
                          setJoinShelfBusy(true);
                          try {
                            await requestShelfJoin({
                              shelf_kind: "collection",
                              shelf_id: collection.id,
                            });
                            setJoinShelfMsg(
                              "Request sent. The owner can approve it from their notifications.",
                            );
                          } catch (err) {
                            setJoinShelfMsg(
                              err instanceof Error ? err.message : "Could not send request.",
                            );
                          } finally {
                            setJoinShelfBusy(false);
                          }
                        }}
                        className="mt-2 rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                      >
                        {joinShelfBusy ? "Sending…" : "Request to join"}
                      </button>
                      {joinShelfMsg ? (
                        <p className="mt-2 text-xs text-kurator-muted" role="status">
                          {joinShelfMsg}
                        </p>
                      ) : null}
                    </div>
                  )}

                {isOwner && shelfMsg && (
                  <p className="mt-2 text-sm text-kurator-muted" role="status">
                    {shelfMsg}
                  </p>
                )}

                <p className="mt-2 text-xs text-kurator-muted/80">
                  {collection.item_count}{" "}
                  {collection.item_count === 1 ? "item" : "items"}
                  {(() => {
                    const v = visibilityOf(collection);
                    if (v === "followers") return null;
                    const Icon = v === "private" ? Lock : Users;
                    return (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                        <Icon className="h-3 w-3" aria-hidden />
                        {visibilityLabel(v)}
                      </span>
                    );
                  })()}
                </p>
                {isOwner && itemMsg && (
                  <p
                    className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100/90"
                    role="alert"
                  >
                    {itemMsg}
                  </p>
                )}
              </div>
              {isOwner && (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAddItemModalOpen(true)}
                    aria-haspopup="dialog"
                    aria-label="Add Item"
                    title="Add Item"
                    className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionSettingsModalOpen(true)}
                    aria-haspopup="dialog"
                    aria-label="Collection settings"
                    title="Collection settings"
                    className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                  >
                    <Settings className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteShelfOpen(true)}
                    aria-label="Delete collection"
                    title="Delete collection"
                    className="rounded-lg p-2 text-red-200 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </div>
              )}
            </div>
            </PageHeroUnsplash>
          </header>

          <Link
            href="/collections"
            className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All collections
          </Link>

          {items.length === 0 ? (
            isOwner ? (
              <button
                type="button"
                onClick={() => setAddItemModalOpen(true)}
                aria-haspopup="dialog"
                className="mb-8 w-full rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted transition hover:border-kurator-accent/40 hover:bg-kurator-border/20 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                No items in this collection yet. Click to add an item.
              </button>
            ) : (
              <p className="mb-8 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
                No items in this collection yet.
              </p>
            )
          ) : (
            <>
              <div className="mb-6 flex flex-col gap-4 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface/60 p-4 lg:flex-row lg:items-end lg:justify-between">
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
                <label className="block w-full min-w-40 text-sm lg:max-w-xs">
                  <span className="text-kurator-muted">Category</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(
                        e.target.value === "all"
                          ? "all"
                          : (e.target.value as Category),
                      )
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
                <label className="block w-full min-w-45 text-sm lg:max-w-xs">
                  <span className="text-kurator-muted">Status</span>
                  <select
                    value={consumptionFilter}
                    onChange={(e) =>
                      setConsumptionFilter(
                        e.target.value === "all"
                          ? "all"
                          : (e.target.value as ConsumptionStatus),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Not finished yet</option>
                    <option value="done">Finished</option>
                  </select>
                </label>
                <div className="flex shrink-0 items-center gap-1 rounded-lg border border-kurator-border bg-kurator-bg p-1">
                  <span className="sr-only">Layout</span>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    aria-pressed={viewMode === "list"}
                    title="List View"
                    className={`rounded-md p-2 ${viewMode === "list" ? "bg-kurator-accent text-kurator-onAccent" : "text-kurator-muted hover:text-kurator-fg"}`}
                  >
                    <List className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("tiles")}
                    aria-pressed={viewMode === "tiles"}
                    title="Tile View"
                    className={`rounded-md p-2 ${viewMode === "tiles" ? "bg-kurator-accent text-kurator-onAccent" : "text-kurator-muted hover:text-kurator-fg"}`}
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <p className="rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
                  No items match your search or filter.
                </p>
              ) : viewMode === "list" ? (
                <div className="overflow-x-auto rounded-xl shadow-surface border border-kurator-border">
                  <table className="w-full min-w-180 border-collapse text-left text-sm">
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
                                <ArrowUp
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              ) : (
                                <ArrowDown
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              )
                            ) : (
                              <ArrowUpDown
                                className="h-3.5 w-3.5 shrink-0 opacity-40"
                                aria-hidden
                              />
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
                                <ArrowUp
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              ) : (
                                <ArrowDown
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              )
                            ) : (
                              <ArrowUpDown
                                className="h-3.5 w-3.5 shrink-0 opacity-40"
                                aria-hidden
                              />
                            )}
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="w-32 px-3 py-3"
                          aria-sort={
                            listSortKey === "format"
                              ? listSortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleListSort("format")}
                            className="inline-flex items-center gap-1.5 font-medium text-kurator-muted hover:text-kurator-fg"
                          >
                            Format
                            {listSortKey === "format" ? (
                              listSortDir === "asc" ? (
                                <ArrowUp
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              ) : (
                                <ArrowDown
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              )
                            ) : (
                              <ArrowUpDown
                                className="h-3.5 w-3.5 shrink-0 opacity-40"
                                aria-hidden
                              />
                            )}
                          </button>
                        </th>
                        <th
                          scope="col"
                          className="w-36 px-3 py-3 text-xs font-medium uppercase tracking-wide text-kurator-muted"
                        >
                          Status
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
                                <ArrowUp
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              ) : (
                                <ArrowDown
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              )
                            ) : (
                              <ArrowUpDown
                                className="h-3.5 w-3.5 shrink-0 opacity-40"
                                aria-hidden
                              />
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
                                <ArrowUp
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              ) : (
                                <ArrowDown
                                  className="h-3.5 w-3.5 shrink-0 text-kurator-accent"
                                  aria-hidden
                                />
                              )
                            ) : (
                              <ArrowUpDown
                                className="h-3.5 w-3.5 shrink-0 opacity-40"
                                aria-hidden
                              />
                            )}
                          </button>
                        </th>
                        {isOwner && (
                          <th
                            scope="col"
                            className="min-w-[18rem] w-72 px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-kurator-muted"
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
                        const formatLabel = getItemFormatColumnLabel(item);
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
                              <div className="h-20 w-16 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
                                <ItemCoverImage
                                  url={cover}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </td>
                            <td className="kurator-item-title align-top px-3 py-3 text-kurator-fg">
                              {item.title}
                            </td>
                            <td className="align-top px-3 py-3">
                              <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                                {categoryLabel(item.category)}
                              </span>
                            </td>
                            <td className="align-top px-3 py-3 text-kurator-muted">
                              {formatLabel || "—"}
                            </td>
                            <td className="align-top px-3 py-3 text-kurator-muted">
                              <span className="inline-flex rounded-full border border-kurator-border/80 bg-kurator-bg px-2 py-0.5 text-[11px] font-medium text-kurator-fg">
                                {consumptionBadgeText(
                                  item.category,
                                  normalizeConsumptionStatus(item),
                                )}
                              </span>
                            </td>
                            <td className="align-top px-3 py-3">
                              <ItemStarRating
                                value={item.rating ?? null}
                                size="sm"
                              />
                            </td>
                            <td className="align-top px-3 py-3 text-kurator-muted">
                              {year || "—"}
                            </td>
                            {isOwner && (
                              <td
                                className="align-top px-3 py-3 text-right"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <div className="flex flex-nowrap items-center justify-end gap-2">
                                  {moveTargets.length > 0 ? (
                                    <>
                                      <select
                                        aria-label={`Move “${item.title}” to another shelf`}
                                        className="max-w-44 min-w-0 shrink rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg"
                                        value={String(movePick[item.id] ?? "")}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setMovePick((m) => ({
                                            ...m,
                                            [item.id]: v,
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
                                        title="Move to selected shelf"
                                        aria-label={`Move “${item.title}” to selected shelf`}
                                        disabled={
                                          itemBusy?.id === item.id ||
                                          !movePick[item.id] ||
                                          movePick[item.id] === item.collection_id
                                        }
                                        onClick={() =>
                                          void onMoveItemToShelf(
                                            item,
                                            movePick[item.id] ?? "",
                                          )
                                        }
                                        className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/35 disabled:opacity-50"
                                      >
                                        {itemBusy?.id === item.id &&
                                        itemBusy.op === "move" ? (
                                          <Loader2
                                            className="h-4 w-4 animate-spin"
                                            aria-hidden
                                          />
                                        ) : (
                                          <ArrowLeftRight
                                            className="h-4 w-4"
                                            aria-hidden
                                          />
                                        )}
                                      </button>
                                    </>
                                  ) : (
                                    <span className="shrink-0 text-xs text-kurator-muted">
                                      No other shelf
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    title="Edit item"
                                    aria-label={`Edit “${item.title}”`}
                                    disabled={itemBusy?.id === item.id}
                                    onClick={() => setItemToEdit(item)}
                                    className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/35 disabled:opacity-50"
                                  >
                                    <Pencil className="h-4 w-4" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    title="Remove from library"
                                    aria-label={`Remove “${item.title}” from library permanently`}
                                    disabled={itemBusy?.id === item.id}
                                    onClick={() =>
                                      void onRemoveItemForever(item)
                                    }
                                    className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-red-200/90 hover:bg-red-500/10 disabled:opacity-50"
                                  >
                                    {itemBusy?.id === item.id &&
                                    itemBusy.op === "remove" ? (
                                      <Loader2
                                        className="h-4 w-4 animate-spin"
                                        aria-hidden
                                      />
                                    ) : (
                                      <Trash2 className="h-4 w-4" aria-hidden />
                                    )}
                                  </button>
                                </div>
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
                        <div className="flex h-full min-h-70 flex-col rounded-xl border border-kurator-border bg-kurator-surface shadow-surface outline-hidden ring-kurator-accent transition hover:border-kurator-accent/40 focus-within:ring-2">
                          <div className="flex shrink-0 items-start justify-between gap-2 p-4 pb-2">
                            <Link
                              href={`/items/${item.id}`}
                              className="group min-w-0 flex-1 focus-visible:outline-hidden"
                            >
                              <h2 className="kurator-item-title line-clamp-2 text-base font-medium leading-snug text-kurator-fg group-hover:text-kurator-accent">
                                {item.title}
                              </h2>
                            </Link>
                            {isOwner && (
                              <button
                                type="button"
                                aria-label={`Edit “${item.title}”`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setItemToEdit(item);
                                }}
                                className="shrink-0 rounded-lg border border-kurator-border/80 p-1.5 text-kurator-muted hover:border-kurator-accent/50 hover:text-kurator-fg"
                              >
                                <MoreHorizontal
                                  className="h-4 w-4"
                                  aria-hidden
                                />
                              </button>
                            )}
                          </div>
                          <Link
                            href={`/items/${item.id}`}
                            className="group flex flex-1 flex-col focus-visible:outline-hidden"
                          >
                            <div className="shrink-0 space-y-2 px-4 pb-2">
                              <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                                {categoryLabel(item.category)}
                              </span>
                              <span className="mt-1.5 inline-flex rounded-full border border-kurator-border/80 bg-kurator-bg px-2 py-0.5 text-[11px] font-medium text-kurator-fg">
                                {consumptionBadgeText(
                                  item.category,
                                  normalizeConsumptionStatus(item),
                                )}
                              </span>
                              <div className="mt-1.5">
                                <ItemStarRating
                                  value={item.rating ?? null}
                                  size="sm"
                                />
                              </div>
                            </div>
                            <div className="mt-auto flex flex-1 flex-col justify-end p-4 pt-2">
                              <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
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
                                        [item.id]: v,
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
                                      void onMoveItemToShelf(
                                        item,
                                        movePick[item.id] ?? "",
                                      )
                                    }
                                    className="rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg hover:border-kurator-accent/50 disabled:opacity-50"
                                  >
                                    {itemBusy?.id === item.id &&
                                    itemBusy.op === "move"
                                      ? "Moving…"
                                      : "Move to Shelf"}
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-kurator-muted">
                                  Create another collection to move items.
                                </p>
                              )}
                              <button
                                type="button"
                                disabled={itemBusy?.id === item.id}
                                onClick={() => void onRemoveItemForever(item)}
                                className="mt-2 w-full rounded-lg border border-red-500/35 px-2 py-1.5 text-xs text-red-200/90 hover:bg-red-500/10 disabled:opacity-50"
                              >
                                {itemBusy?.id === item.id &&
                                itemBusy.op === "remove"
                                  ? "Removing…"
                                  : "Remove From Library"}
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
