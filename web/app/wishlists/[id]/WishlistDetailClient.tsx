"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleHelp,
  Download,
  Lock,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  CategoryMetadataFields,
  type CategoryFormSlice,
} from "@/components/CategoryMetadataFields";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { TitleMetadataSearch } from "@/components/TitleMetadataSearch";
import {
  createWishlistEntry,
  DEFAULT_VISIBILITY,
  deleteWishlistEntry,
  exportWishlistEntriesCsv,
  fetchCollections,
  fetchWishlist,
  fetchWishlistEntries,
  importWishlistEntriesCsv,
  obtainWishlistEntry,
  updateWishlist,
  visibilityLabel,
  visibilityOf,
  type Category,
  type Visibility,
  type Wishlist,
  type WishlistEntry,
} from "@/lib/api";
import { categoryLabel } from "@/lib/categoryLabels";
import { buildItemMetadata } from "@/lib/itemMetadata";
import { mergeCategoryFormSlice } from "@/lib/mergeCategoryFormSlice";
import { isEntityUuid } from "@/lib/entityId";
import { getCoverArtUrl } from "@/lib/itemDisplay";
import {
  assertCollectionOrWishlistName,
  assertItemTitle,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";
import { useAuth } from "@/components/AuthProvider";
import { CoverArtEditModal } from "@/components/CoverArtEditModal";
import { DeleteEntryBucketDialog } from "@/components/DeleteEntryBucketDialog";
import { WishlistAddEntryModal } from "@/components/WishlistAddEntryModal";
import { WishlistSettingsModal } from "@/components/WishlistSettingsModal";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { VisibilitySelect } from "@/components/VisibilitySelect";

const categories: { value: Category; label: string }[] = [
  { value: "game", label: "Game" },
  { value: "music", label: "Music" },
  { value: "book", label: "Book" },
  { value: "movies", label: "Movies" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "comic_book", label: "Comic book" },
  { value: "manga", label: "Manga" },
];

type CollectionShelfOption = {
  id: string;
  name: string;
  /** `null` = mixed shelf; accepts any item category. */
  category: Category | null;
};

function shelvesForEntryCategory(
  shelves: CollectionShelfOption[],
  itemCategory: Category,
): CollectionShelfOption[] {
  return shelves.filter(
    (c) => c.category == null || c.category === itemCategory,
  );
}

export function WishlistDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const idRaw = params.id;
  const id =
    typeof idRaw === "string" && isEntityUuid(idRaw) ? idRaw.trim() : "";

  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [collections, setCollections] = useState<CollectionShelfOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTarget, setEditTarget] = useState<string>("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [shelfLinkMsg, setShelfLinkMsg] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [destCollectionId, setDestCollectionId] = useState<string | null>(null);
  const [entryObtainColl, setEntryObtainColl] = useState<
    Record<string, string>
  >({});
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityMsg, setVisibilityMsg] = useState<string | null>(null);

  const [addTitle, setAddTitle] = useState("");
  const [addCategory, setAddCategory] = useState<Category>("game");
  const [addSlice, setAddSlice] = useState<CategoryFormSlice>({});
  const [addStatus, setAddStatus] = useState<"idle" | "saving">("idle");
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const [obtainBusy, setObtainBusy] = useState<string | null>(null);

  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [deleteWishlistOpen, setDeleteWishlistOpen] = useState(false);
  const [coverArtModalOpen, setCoverArtModalOpen] = useState(false);
  const [addWishlistModalOpen, setAddWishlistModalOpen] = useState(false);
  const [wishlistSettingsModalOpen, setWishlistSettingsModalOpen] =
    useState(false);
  const addTitleInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchWishlist(id),
      fetchWishlistEntries(id),
      fetchCollections({ limit: 100, sort: "name_asc" }).then((r) =>
        r.items.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category ?? null,
        })),
      ),
    ])
      .then(([wl, ent, cols]) => {
        setWishlist(wl);
        setEntries(ent);
        setCollections(cols);
        setEditName(wl.name);
        setEditDesc(wl.description ?? "");
        setEditTarget(wl.target_collection_id ?? "");
        if (
          wl.target_collection_id &&
          cols.some((c) => c.id === wl.target_collection_id)
        ) {
          setDestCollectionId(wl.target_collection_id);
        } else if (cols.length > 0) {
          setDestCollectionId(cols[0].id);
        } else {
          setDestCollectionId(null);
        }
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load wishlist."),
      )
      .finally(() => setLoading(false));
  }, [id]);

  const reloadWishlistEntries = useCallback(async () => {
    if (!id) return;
    const [wl, ent] = await Promise.all([
      fetchWishlist(id),
      fetchWishlistEntries(id),
    ]);
    setWishlist(wl);
    setEntries(ent);
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!wishlist) return;
    if (!editingTitle) setEditName(wishlist.name);
    if (!editingDesc) setEditDesc(wishlist.description ?? "");
  }, [wishlist, editingTitle, editingDesc]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingDesc) descTextareaRef.current?.focus();
  }, [editingDesc]);

  useEffect(() => {
    if (!addWishlistModalOpen) return;
    requestAnimationFrame(() => {
      addTitleInputRef.current?.focus();
    });
  }, [addWishlistModalOpen]);

  const isOwner =
    wishlist != null &&
    user != null &&
    Number(wishlist.user_id) === Number(user.id);

  function cancelTitleEdit() {
    if (!wishlist) return;
    setEditName(wishlist.name);
    setEditingTitle(false);
    setSettingsMsg(null);
  }

  function cancelDescEdit() {
    if (!wishlist) return;
    setEditDesc(wishlist.description ?? "");
    setEditingDesc(false);
    setSettingsMsg(null);
  }

  async function commitTitleEdit() {
    if (!wishlist || !isOwner || !id) return;
    const trimmed = editName.trim();
    if (trimmed === wishlist.name.trim()) {
      setEditingTitle(false);
      return;
    }
    setSettingsMsg(null);
    setSavingSettings(true);
    try {
      const name = assertCollectionOrWishlistName(editName, "Wishlist name");
      const descRaw = editDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(editDesc, LIMITS.description, "Description")
        : "";
      const v = visibilityOf(wishlist);
      const updated = await updateWishlist(id, {
        name,
        description,
        target_collection_id:
          editTarget.trim() === "" ? null : editTarget.trim(),
        visibility: v,
        is_public: v !== "private",
      });
      setWishlist(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditTarget(updated.target_collection_id ?? "");
      setEditingTitle(false);
      setSettingsMsg("Saved.");
    } catch (err) {
      setSettingsMsg(
        err instanceof Error ? err.message : "Could not save name.",
      );
      setEditName(wishlist.name);
      setEditingTitle(false);
    } finally {
      setSavingSettings(false);
    }
  }

  async function commitDescEdit(opts?: { keepEditing?: boolean }) {
    if (!wishlist || !isOwner || !id) return;
    const trimmed = editDesc.trim();
    const current = (wishlist.description ?? "").trim();
    if (trimmed === current) {
      if (!opts?.keepEditing) setEditingDesc(false);
      return;
    }
    setSettingsMsg(null);
    setSavingSettings(true);
    try {
      const name = assertCollectionOrWishlistName(editName, "Wishlist name");
      const description = trimmed
        ? assertLooseMultilineText(editDesc, LIMITS.description, "Description")
        : "";
      const v = visibilityOf(wishlist);
      const updated = await updateWishlist(id, {
        name,
        description,
        target_collection_id:
          editTarget.trim() === "" ? null : editTarget.trim(),
        visibility: v,
        is_public: v !== "private",
      });
      setWishlist(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditTarget(updated.target_collection_id ?? "");
      if (!opts?.keepEditing) {
        setEditingDesc(false);
      }
      setSettingsMsg("Saved.");
      if (opts?.keepEditing) {
        requestAnimationFrame(() => descTextareaRef.current?.focus());
      }
    } catch (err) {
      setSettingsMsg(
        err instanceof Error ? err.message : "Could not save description.",
      );
      setEditDesc(wishlist.description ?? "");
      setEditingDesc(false);
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveWishlistCover(url: string) {
    if (!wishlist || !isOwner || !id) return;
    setSettingsMsg(null);
    setSavingSettings(true);
    try {
      const name = assertCollectionOrWishlistName(
        wishlist.name,
        "Wishlist name",
      );
      const descSource = wishlist.description ?? "";
      const descRaw = descSource.trim();
      const description = descRaw
        ? assertLooseMultilineText(
            descSource,
            LIMITS.description,
            "Description",
          )
        : "";
      const v = visibilityOf(wishlist);
      const updated = await updateWishlist(id, {
        name,
        description,
        target_collection_id: wishlist.target_collection_id ?? null,
        visibility: v,
        is_public: v !== "private",
        cover_art_url: url,
      });
      setWishlist(updated);
      setSettingsMsg("Cover saved.");
      setCoverArtModalOpen(false);
    } catch (err) {
      setSettingsMsg(
        err instanceof Error ? err.message : "Could not save cover.",
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function onSaveLinkedCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !wishlist) return;
    setShelfLinkMsg(null);
    setSavingSettings(true);
    try {
      const name = assertCollectionOrWishlistName(
        wishlist.name,
        "Wishlist name",
      );
      const descSource = wishlist.description ?? "";
      const descRaw = descSource.trim();
      const description = descRaw
        ? assertLooseMultilineText(
            descSource,
            LIMITS.description,
            "Description",
          )
        : "";
      const v = visibilityOf(wishlist);
      const updated = await updateWishlist(id, {
        name,
        description,
        target_collection_id:
          editTarget.trim() === "" ? null : editTarget.trim(),
        visibility: v,
        is_public: v !== "private",
      });
      setWishlist(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditTarget(updated.target_collection_id ?? "");
      setShelfLinkMsg("Saved.");
    } catch (err) {
      setShelfLinkMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function onExportWishlistCsv() {
    setImportMsg(null);
    try {
      const blob = await exportWishlistEntriesCsv(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wishlist-${id}-entries.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Export failed.");
    }
  }

  function onImportWishlistPickClick() {
    importFileRef.current?.click();
  }

  async function onImportWishlistFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const res = await importWishlistEntriesCsv(id, file);
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
      await reloadWishlistEntries();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  async function onAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
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
      setAddWishlistModalOpen(false);
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : "Could not add.");
    } finally {
      setAddStatus("idle");
    }
  }

  function resolveObtainCollectionId(entry: WishlistEntry): string | null {
    const options = shelvesForEntryCategory(collections, entry.category);
    const allowed = new Set(options.map((c) => c.id));
    const fromEntry = entryObtainColl[entry.id];
    if (
      fromEntry != null &&
      fromEntry.trim() !== "" &&
      allowed.has(fromEntry)
    ) {
      return fromEntry.trim();
    }
    if (
      destCollectionId != null &&
      destCollectionId.trim() !== "" &&
      allowed.has(destCollectionId)
    ) {
      return destCollectionId.trim();
    }
    const first = options[0]?.id;
    return first != null && first.trim() !== "" ? first : null;
  }

  async function onObtain(entry: WishlistEntry) {
    if (!id) return;
    const cid = resolveObtainCollectionId(entry);
    if (cid == null || cid.trim() === "") {
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
      setError(
        err instanceof Error ? err.message : "Could not add to collection.",
      );
    } finally {
      setObtainBusy(null);
    }
  }

  async function onRemoveEntry(entry: WishlistEntry) {
    if (!id) return;
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

  if (!id) {
    return (
      <p className="text-sm text-red-400" role="alert">
        Invalid wishlist.
      </p>
    );
  }

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
        <p
          className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {!loading && wishlist && (
        <>
          <DeleteEntryBucketDialog
            variant="wishlist"
            subject={{
              id: wishlist.id,
              name: wishlist.name,
              entry_count: wishlist.entry_count,
            }}
            open={deleteWishlistOpen}
            onOpenChange={setDeleteWishlistOpen}
            onDeleted={() => {
              router.push("/wishlists", { scroll: false });
              router.refresh();
            }}
          />
          {isOwner && (
            <CoverArtEditModal
              open={coverArtModalOpen}
              onOpenChange={setCoverArtModalOpen}
              title="Wishlist cover art"
              value={wishlist.cover_art_url ?? ""}
              disabled={savingSettings}
              onChange={(url) => void saveWishlistCover(url)}
            />
          )}
          <header className="mb-6 flex flex-col gap-6">
            {(wishlist.cover_art_url?.trim() || isOwner) &&
              (isOwner ? (
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => setCoverArtModalOpen(true)}
                  aria-label="Edit cover art"
                  className="relative w-full overflow-hidden rounded-xl border border-kurator-border/60 bg-kurator-bg text-left shadow-xs ring-kurator-accent transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="relative aspect-5/2 w-full min-h-42 max-h-68 md:aspect-21/9 md:min-h-48 md:max-h-88">
                    {wishlist.cover_art_url?.trim() ? (
                      <ItemCoverImage
                        url={wishlist.cover_art_url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-linear-to-b from-kurator-border/25 to-kurator-border/50 px-4 text-center text-sm text-kurator-muted">
                        No cover yet — click to add cover art
                      </div>
                    )}
                  </div>
                </button>
              ) : (
                <div className="relative w-full overflow-hidden rounded-xl border border-kurator-border/60 bg-kurator-bg shadow-xs">
                  <div className="relative aspect-5/2 w-full min-h-42 max-h-68 md:aspect-21/9 md:min-h-48 md:max-h-88">
                    {wishlist.cover_art_url?.trim() ? (
                      <ItemCoverImage
                        url={wishlist.cover_art_url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                {isOwner ? (
                  editingTitle ? (
                    <div className="max-w-3xl">
                      <input
                        ref={titleInputRef}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
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
                        disabled={savingSettings}
                        className="w-full rounded-lg border border-kurator-accent bg-kurator-bg px-3 py-2 text-2xl font-semibold text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 md:text-3xl"
                        aria-label="Wishlist name"
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
                            disabled={savingSettings}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void commitTitleEdit()}
                            className="rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                          >
                            {savingSettings ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            disabled={savingSettings}
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
                      disabled={savingSettings}
                      className="group flex max-w-full items-start gap-2 rounded-lg text-left text-2xl font-semibold text-kurator-fg outline-hidden ring-kurator-accent hover:bg-kurator-border/40 focus-visible:ring-2 disabled:opacity-50 md:text-3xl"
                    >
                      <span className="min-w-0 wrap-break-word">
                        {wishlist.name}
                      </span>
                      <Pencil
                        className="mt-1.5 h-5 w-5 shrink-0 text-kurator-muted opacity-60 group-hover:opacity-100 md:mt-2 md:h-6 md:w-6"
                        aria-hidden
                      />
                      <span className="sr-only">Edit name</span>
                    </button>
                  )
                ) : (
                  <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">{wishlist.name}</h1>
                )}

                {isOwner ? (
                  editingDesc ? (
                    <div className="mt-3 max-w-3xl">
                      <textarea
                        ref={descTextareaRef}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        onBlur={() => void commitDescEdit()}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelDescEdit();
                          } else if (
                            (e.metaKey || e.ctrlKey) &&
                            e.key === "Enter"
                          ) {
                            e.preventDefault();
                            void commitDescEdit({ keepEditing: true });
                          }
                        }}
                        disabled={savingSettings}
                        rows={4}
                        className="w-full resize-y rounded-lg border border-kurator-accent bg-kurator-bg px-3 py-2 text-sm leading-relaxed text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                        aria-label="Wishlist description"
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-kurator-muted">
                          ⌘ or Ctrl+Enter saves and keeps you here · Esc cancels
                          · Blur or Save closes the editor
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={savingSettings}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void commitDescEdit()}
                            className="rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                          >
                            {savingSettings ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            disabled={savingSettings}
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
                      disabled={savingSettings}
                      className="group mt-2 flex w-full max-w-3xl items-start gap-2 rounded-lg text-left outline-hidden ring-kurator-accent hover:bg-kurator-border/40 focus-visible:ring-2 disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1 text-sm leading-relaxed text-kurator-muted group-hover:text-kurator-fg/90">
                        {(wishlist.description ?? "").trim() ? (
                          wishlist.description
                        ) : (
                          <span className="italic">Add a description…</span>
                        )}
                      </span>
                      <Pencil
                        className="mt-1 h-4 w-4 shrink-0 text-kurator-muted opacity-60 group-hover:opacity-100"
                        aria-hidden
                      />
                      <span className="sr-only">Edit description</span>
                    </button>
                  )
                ) : (
                  wishlist.description && (
                    <p className="mt-2 text-sm text-kurator-muted">
                      {wishlist.description}
                    </p>
                  )
                )}

                <p className="mt-2 text-xs text-kurator-muted">
                  Shelf Type:{" "}
                  <span className="font-medium text-kurator-fg">Playlist</span>
                </p>
                {wishlist.author ? (
                  <div className="mt-2">
                    <ShelfAuthorLink author={wishlist.author} variant="avatarAndName" />
                  </div>
                ) : null}

                {isOwner && settingsMsg && (
                  <p className="mt-2 text-sm text-kurator-muted" role="status">
                    {settingsMsg}
                  </p>
                )}

                <p className="mt-2 text-xs text-kurator-muted/80">
                  {wishlist.entry_count}{" "}
                  {wishlist.entry_count === 1 ? "item" : "items"} wished
                  {(() => {
                    const v = visibilityOf(wishlist);
                    const Icon = v === "private" ? Lock : Users;
                    return (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                        <Icon className="h-3 w-3" aria-hidden />
                        {visibilityLabel(v)}
                      </span>
                    );
                  })()}
                </p>
                {!isOwner && (
                  <p className="mt-2 text-xs text-kurator-muted">
                    You’re viewing another member’s public list (read-only).
                  </p>
                )}
              </div>
              {isOwner && (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAddWishlistModalOpen(true)}
                    aria-haspopup="dialog"
                    aria-label="Add Item"
                    title="Add Item"
                    className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setWishlistSettingsModalOpen(true)}
                    aria-haspopup="dialog"
                    aria-label="Wishlist settings"
                    title="Wishlist settings"
                    className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                  >
                    <Settings className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteWishlistOpen(true)}
                    aria-label="Delete wishlist"
                    title="Delete wishlist"
                    className="rounded-lg p-2 text-red-200 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                </div>
              )}
            </div>
          </header>

          {isOwner && (
            <WishlistSettingsModal
              open={wishlistSettingsModalOpen}
              onOpenChange={setWishlistSettingsModalOpen}
            >
              <div className="space-y-6">
                <div className="rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
                  <VisibilitySelect
                    name="wishlist-settings-visibility"
                    legend="Visibility"
                    value={visibilityOf(wishlist) ?? DEFAULT_VISIBILITY}
                    disabled={visibilitySaving}
                    onChange={async (next: Visibility) => {
                      setVisibilityMsg(null);
                      setVisibilitySaving(true);
                      try {
                        const updated = await updateWishlist(id, {
                          name: wishlist.name,
                          description: wishlist.description ?? "",
                          target_collection_id:
                            wishlist.target_collection_id ?? null,
                          visibility: next,
                          is_public: next !== "private",
                        });
                        setWishlist(updated);
                      } catch (err) {
                        setVisibilityMsg(
                          err instanceof Error
                            ? err.message
                            : "Could not update visibility.",
                        );
                      } finally {
                        setVisibilitySaving(false);
                      }
                    }}
                  />
                  {visibilityMsg && (
                    <p className="mt-2 text-sm text-amber-200/90" role="status">
                      {visibilityMsg}
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
                      aria-label="Columns: title, category, optional id (to update an entry already on this list), optional metadata (JSON). Shelf exports with rating or consumption columns can be imported here; those columns are ignored."
                    >
                      <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span
                      role="tooltip"
                      className="pointer-events-none invisible absolute bottom-full left-0 z-60 mb-1.5 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                    >
                      Columns: title, category, optional id (to update an entry
                      already on this list), optional metadata (JSON). Shelf
                      exports with rating or consumption columns can be imported
                      here; those columns are ignored.
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onExportWishlistCsv()}
                      className="inline-flex items-center gap-2 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg hover:border-kurator-accent/50"
                    >
                      <Download className="h-4 w-4 shrink-0" aria-hidden />
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={onImportWishlistPickClick}
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
                      onChange={onImportWishlistFileChange}
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

                <form
                  onSubmit={onSaveLinkedCollection}
                  className="rounded-xl border border-kurator-border bg-kurator-bg/40 p-4"
                >
                  <h3 className="text-sm font-medium text-kurator-fg">
                    Default shelf
                  </h3>
                  <p className="mt-1 text-xs text-kurator-muted">
                    Optional default collection for “Add to collection” on each
                    wished item (each card can still pick another shelf).
                  </p>
                  <label className="mt-4 block text-sm">
                    <span className="text-kurator-muted">
                      Linked collection
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                      value={editTarget}
                      onChange={(e) => {
                        setEditTarget(e.target.value);
                      }}
                    >
                      <option value="">None</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                    >
                      {savingSettings ? "Saving…" : "Save Link"}
                    </button>
                    {shelfLinkMsg && (
                      <p className="text-sm text-kurator-muted" role="status">
                        {shelfLinkMsg}
                      </p>
                    )}
                  </div>
                </form>
              </div>
            </WishlistSettingsModal>
          )}

          {entries.length === 0 ? (
            isOwner ? (
              <button
                type="button"
                onClick={() => setAddWishlistModalOpen(true)}
                aria-haspopup="dialog"
                className="mb-8 w-full rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted transition hover:border-kurator-accent/40 hover:bg-kurator-border/20 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                Nothing on this list yet. Click to add an item.
              </button>
            ) : (
              <p className="mb-8 rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
                Nothing on this list yet.
              </p>
            )
          ) : (
            <>
              <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((item) => {
                  const cover = getCoverArtUrl(item.metadata);
                  const addToShelfOptions = shelvesForEntryCategory(
                    collections,
                    item.category,
                  );
                  const addToShelfIds = new Set(
                    addToShelfOptions.map((c) => c.id),
                  );
                  const pickRaw = entryObtainColl[item.id]?.trim() ?? "";
                  const fromPick =
                    pickRaw !== "" && addToShelfIds.has(pickRaw)
                      ? pickRaw
                      : null;
                  const defaultRaw = destCollectionId?.trim() ?? "";
                  const fromDefault =
                    defaultRaw !== "" && addToShelfIds.has(defaultRaw)
                      ? defaultRaw
                      : null;
                  const preferredShelfId =
                    fromPick ?? fromDefault ?? addToShelfOptions[0]?.id ?? "";
                  return (
                    <li key={item.id}>
                      <div className="flex h-full min-h-70 flex-col rounded-xl border border-kurator-border bg-kurator-surface shadow-xs">
                        <div className="shrink-0 space-y-2 p-4 pb-2">
                          <h2 className="line-clamp-2 text-base font-medium leading-snug text-kurator-fg">
                            {item.title}
                          </h2>
                          <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                            {categoryLabel(item.category)}
                          </span>
                        </div>
                        <div className="mt-auto flex flex-1 flex-col justify-end p-4 pt-2">
                          <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-xs">
                            <ItemCoverImage
                              url={cover}
                              alt={`Cover for ${item.title}`}
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          </div>
                          {isOwner && (
                            <div className="mt-3 space-y-2 border-t border-kurator-border/60 pt-3">
                              <label className="block text-xs text-kurator-muted">
                                Add to shelf
                                <select
                                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg"
                                  value={preferredShelfId}
                                  onChange={(e) => {
                                    setEntryObtainColl((m) => ({
                                      ...m,
                                      [item.id]: e.target.value,
                                    }));
                                  }}
                                  disabled={addToShelfOptions.length === 0}
                                >
                                  {addToShelfOptions.length === 0 ? (
                                    <option value="">
                                      {collections.length === 0
                                        ? "Create a collection first"
                                        : "No shelf matches this type"}
                                    </option>
                                  ) : (
                                    addToShelfOptions.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))
                                  )}
                                </select>
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    obtainBusy === item.id ||
                                    resolveObtainCollectionId(item) == null ||
                                    addToShelfOptions.length === 0
                                  }
                                  onClick={() => onObtain(item)}
                                  className="flex-1 rounded-lg bg-kurator-accent px-3 py-2 text-center text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                                >
                                  {obtainBusy === item.id
                                    ? "Adding…"
                                    : "Add to Collection"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRemoveEntry(item)}
                                  className="rounded-lg border border-kurator-border px-3 py-2 text-xs text-kurator-muted hover:text-kurator-fg"
                                >
                                  Remove
                                </button>
                              </div>
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
            <WishlistAddEntryModal
              open={addWishlistModalOpen}
              onOpenChange={setAddWishlistModalOpen}
            >
              <form onSubmit={onAddEntry} className="space-y-6">
                <label className="block text-sm">
                  <span className="text-kurator-muted">Title</span>
                  <input
                    ref={addTitleInputRef}
                    required
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                  />
                </label>

                <TitleMetadataSearch
                  category={addCategory}
                  title={addTitle}
                  onApply={({ title: nextTitle, slice }) => {
                    if (nextTitle) setAddTitle(nextTitle);
                    setAddSlice((prev) => mergeCategoryFormSlice(prev, slice));
                  }}
                />

                <label className="block text-sm">
                  <span className="text-kurator-muted">Category</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
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
                  <p className="text-sm font-medium text-kurator-muted">
                    Category fields
                  </p>
                  <CategoryMetadataFields
                    category={addCategory}
                    values={addSlice}
                    onChange={setAddSlice}
                  />
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
                  {addStatus === "saving" ? "Adding…" : "Add to Wishlist"}
                </button>
              </form>
            </WishlistAddEntryModal>
          )}
        </>
      )}
    </div>
  );
}
