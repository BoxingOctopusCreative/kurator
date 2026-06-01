"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  CircleHelp,
  Download,
  ExternalLink,
  LayoutGrid,
  List,
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
import { MarkdownBody } from "@/components/MarkdownBody";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import { PageHeroUnsplash, MAIN_COLUMN_BRAND_STRIP_CLASS } from "@/components/PageHeroUnsplash";
import { PublicBrandMenu } from "@/components/PublicBrandMenu";
import { TitleMetadataSearch } from "@/components/TitleMetadataSearch";
import {
  createWishlistEntry,
  DEFAULT_VISIBILITY,
  deleteWishlistEntry,
  patchWishlistEntryPurchaseUrl,
  exportWishlistEntriesCsv,
  fetchCollections,
  fetchMyFriends,
  fetchWishlist,
  fetchWishlistEntries,
  importWishlistEntriesCsv,
  obtainWishlistEntry,
  requestShelfJoin,
  collectionMayReceiveItems,
  updateWishlist,
  visibilityLabel,
  visibilityOf,
  type Category,
  type PublicUser,
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
  assertOptionalHttpUrl,
  LIMITS,
} from "@/lib/validation";
import { useListFlyIn } from "@/lib/useListFlyIn";
import { useAuth } from "@/components/AuthProvider";
import { CoverArtField } from "@/components/CoverArtField";
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

const WISHLIST_ENTRIES_VIEW_KEY = "kurator_wishlist_entries_view";

type WishlistEntryEditControlsProps = {
  item: WishlistEntry;
  collections: CollectionShelfOption[];
  entryObtainColl: Record<string, string>;
  setEntryObtainColl: Dispatch<SetStateAction<Record<string, string>>>;
  destCollectionId: string | null;
  purchaseEditId: string | null;
  purchaseEditValue: string;
  setPurchaseEditValue: (v: string) => void;
  purchaseSaveBusy: string | null;
  purchaseEditMsg: string | null;
  startPurchaseEdit: (entry: WishlistEntry) => void;
  cancelPurchaseEdit: () => void;
  savePurchaseEdit: (entry: WishlistEntry) => Promise<void>;
  obtainBusy: string | null;
  onObtain: (entry: WishlistEntry) => void;
  onRemoveEntry: (entry: WishlistEntry) => void;
  resolveObtainCollectionId: (entry: WishlistEntry) => string | null;
  className?: string;
};

function WishlistEntryEditControls({
  item,
  collections,
  entryObtainColl,
  setEntryObtainColl,
  destCollectionId,
  purchaseEditId,
  purchaseEditValue,
  setPurchaseEditValue,
  purchaseSaveBusy,
  purchaseEditMsg,
  startPurchaseEdit,
  cancelPurchaseEdit,
  savePurchaseEdit,
  obtainBusy,
  onObtain,
  onRemoveEntry,
  resolveObtainCollectionId,
  className,
}: WishlistEntryEditControlsProps) {
  const addToShelfOptions = shelvesForEntryCategory(collections, item.category);
  const addToShelfIds = new Set(addToShelfOptions.map((c) => c.id));
  const pickRaw = entryObtainColl[item.id]?.trim() ?? "";
  const fromPick =
    pickRaw !== "" && addToShelfIds.has(pickRaw) ? pickRaw : null;
  const defaultRaw = destCollectionId?.trim() ?? "";
  const fromDefault =
    defaultRaw !== "" && addToShelfIds.has(defaultRaw) ? defaultRaw : null;
  const preferredShelfId =
    fromPick ?? fromDefault ?? addToShelfOptions[0]?.id ?? "";

  return (
    <div
      className={
        className ?? "mt-3 space-y-2 border-t border-kurator-border/60 pt-3"
      }
    >
      {purchaseEditId === item.id ? (
        <div className="space-y-2">
          <label className="block text-xs text-kurator-muted">
            Purchase link
            <input
              type="url"
              inputMode="url"
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-2 py-1.5 text-xs text-kurator-fg"
              value={purchaseEditValue}
              onChange={(e) => setPurchaseEditValue(e.target.value)}
              disabled={purchaseSaveBusy === item.id}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={purchaseSaveBusy === item.id}
              onClick={() => void savePurchaseEdit(item)}
              className="rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
            >
              {purchaseSaveBusy === item.id ? "Saving…" : "Save link"}
            </button>
            <button
              type="button"
              disabled={purchaseSaveBusy === item.id}
              onClick={cancelPurchaseEdit}
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs text-kurator-muted hover:text-kurator-fg disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {purchaseEditMsg && purchaseEditId === item.id && (
            <p className="text-xs text-red-400" role="alert">
              {purchaseEditMsg}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => startPurchaseEdit(item)}
          className="text-xs text-kurator-muted hover:text-kurator-accent"
        >
          {(item.purchase_url ?? "").trim()
            ? "Edit purchase link"
            : "Add purchase link"}
        </button>
      )}
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
          {obtainBusy === item.id ? "Adding…" : "Add to Collection"}
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
  );
}

/** Fields that stay stable when toggling sharing or sending invites from settings. */
function wishlistStableUpdateBody(wl: Wishlist) {
  const v = visibilityOf(wl) ?? DEFAULT_VISIBILITY;
  return {
    name: wl.name,
    description: wl.description ?? "",
    target_collection_id: wl.target_collection_id ?? null,
    visibility: v,
    is_public: v !== "private",
  };
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
  const [descFocusTick, setDescFocusTick] = useState(0);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [destCollectionId, setDestCollectionId] = useState<string | null>(null);
  const [entryObtainColl, setEntryObtainColl] = useState<
    Record<string, string>
  >({});
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityMsg, setVisibilityMsg] = useState<string | null>(null);

  const [addTitle, setAddTitle] = useState("");
  const [addCategory, setAddCategory] = useState<Category>("game");
  const [addSlice, setAddSlice] = useState<CategoryFormSlice>({});
  const [addPurchaseUrl, setAddPurchaseUrl] = useState("");
  const [addStatus, setAddStatus] = useState<"idle" | "saving">("idle");
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const [purchaseEditId, setPurchaseEditId] = useState<string | null>(null);
  const [purchaseEditValue, setPurchaseEditValue] = useState("");
  const [purchaseSaveBusy, setPurchaseSaveBusy] = useState<string | null>(null);
  const [purchaseEditMsg, setPurchaseEditMsg] = useState<string | null>(null);

  const [obtainBusy, setObtainBusy] = useState<string | null>(null);

  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [deleteWishlistOpen, setDeleteWishlistOpen] = useState(false);
  const [addWishlistModalOpen, setAddWishlistModalOpen] = useState(false);
  const [wishlistSettingsModalOpen, setWishlistSettingsModalOpen] =
    useState(false);
  const [joinWishlistMsg, setJoinWishlistMsg] = useState<string | null>(null);
  const [joinWishlistBusy, setJoinWishlistBusy] = useState(false);
  const addTitleInputRef = useRef<HTMLInputElement>(null);

  const [shareFriends, setShareFriends] = useState<PublicUser[]>([]);
  const [shareFriendsLoading, setShareFriendsLoading] = useState(false);
  const [shareInviteIds, setShareInviteIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [shareToggleBusy, setShareToggleBusy] = useState(false);
  const [shareInviteBusy, setShareInviteBusy] = useState(false);
  const [shareShelfMsg, setShareShelfMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "tiles">("tiles");

  const { notifyNewItems, entryMotionClass, runWithFlyOut } =
    useListFlyIn(entries);

  const loadAll = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchWishlist(id),
      fetchWishlistEntries(id),
      fetchCollections({ limit: 100, sort: "name_asc" }).then((r) =>
        r.items
          .filter(collectionMayReceiveItems)
          .map((c) => ({
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
        const allowedCollIds = new Set(cols.map((c) => c.id));
        const rawTarget = wl.target_collection_id ?? "";
        setEditTarget(
          rawTarget && allowedCollIds.has(rawTarget) ? rawTarget : "",
        );
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

  const reloadWishlistEntries = useCallback(
    async (opts?: { flyInNew?: boolean }) => {
      if (!id) return;
      const [wl, ent] = await Promise.all([
        fetchWishlist(id),
        fetchWishlistEntries(id),
      ]);
      setWishlist(wl);
      setEntries(ent);
      notifyNewItems(ent, opts?.flyInNew);
    },
    [id, notifyNewItems],
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(WISHLIST_ENTRIES_VIEW_KEY);
    if (v === "list" || v === "tiles") setViewMode(v);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(WISHLIST_ENTRIES_VIEW_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!wishlist) return;
    if (!editingTitle) setEditName(wishlist.name);
    if (!editingDesc) setEditDesc(wishlist.description ?? "");
  }, [wishlist, editingTitle, editingDesc]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingDesc) setDescFocusTick((n) => n + 1);
  }, [editingDesc]);

  useEffect(() => {
    if (!addWishlistModalOpen) return;
    requestAnimationFrame(() => {
      addTitleInputRef.current?.focus();
    });
  }, [addWishlistModalOpen]);

  useEffect(() => {
    if (!wishlistSettingsModalOpen || !user) return;
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
  }, [wishlistSettingsModalOpen, user]);

  useEffect(() => {
    if (!wishlistSettingsModalOpen) {
      setShareInviteIds(new Set());
      setShareShelfMsg(null);
    }
  }, [wishlistSettingsModalOpen]);

  const isOwner =
    wishlist != null &&
    user != null &&
    Number(wishlist.user_id) === Number(user.id);
  const canEditEntries = wishlist?.may_edit_entries === true;

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
        requestAnimationFrame(() => setDescFocusTick((n) => n + 1));
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
      await reloadWishlistEntries({ flyInNew: true });
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
      const purchaseUrl = assertOptionalHttpUrl(
        addPurchaseUrl,
        "Purchase link",
      );
      await createWishlistEntry(id, {
        title: safeTitle,
        category: addCategory,
        metadata,
        purchase_url: purchaseUrl || null,
      });
      setAddTitle("");
      setAddSlice({});
      setAddPurchaseUrl("");
      const ent = await fetchWishlistEntries(id);
      setEntries(ent);
      notifyNewItems(ent, true);
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
      await runWithFlyOut([entry.id], async () => {
        await obtainWishlistEntry(id, entry.id, cid);
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
        const wl = await fetchWishlist(id);
        setWishlist(wl);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add to collection.",
      );
    } finally {
      setObtainBusy(null);
    }
  }

  function startPurchaseEdit(entry: WishlistEntry) {
    setPurchaseEditId(entry.id);
    setPurchaseEditValue(entry.purchase_url ?? "");
    setPurchaseEditMsg(null);
  }

  function cancelPurchaseEdit() {
    setPurchaseEditId(null);
    setPurchaseEditValue("");
    setPurchaseEditMsg(null);
  }

  async function savePurchaseEdit(entry: WishlistEntry) {
    if (!id) return;
    setPurchaseEditMsg(null);
    setPurchaseSaveBusy(entry.id);
    try {
      const purchaseUrl = assertOptionalHttpUrl(
        purchaseEditValue,
        "Purchase link",
      );
      const updated = await patchWishlistEntryPurchaseUrl(
        id,
        entry.id,
        purchaseUrl || null,
      );
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? updated : e)),
      );
      cancelPurchaseEdit();
    } catch (err) {
      setPurchaseEditMsg(
        err instanceof Error ? err.message : "Could not save link.",
      );
    } finally {
      setPurchaseSaveBusy(null);
    }
  }

  async function onRemoveEntry(entry: WishlistEntry) {
    if (!id) return;
    if (!window.confirm(`Remove “${entry.title}” from this wishlist?`)) return;
    try {
      await runWithFlyOut([entry.id], async () => {
        await deleteWishlistEntry(id, entry.id);
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
        const wl = await fetchWishlist(id);
        setWishlist(wl);
      });
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
      {loading && (
        <>
          <Link
            href="/wishlists"
            className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All wishlists
          </Link>
          <p className="text-sm text-kurator-muted">Loading…</p>
        </>
      )}
      {error && !loading && (
        <div className="mb-4 space-y-4">
          <Link
            href="/wishlists"
            className="inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All wishlists
          </Link>
          <p
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {error}
          </p>
        </div>
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
          <header className="mb-6 flex flex-col gap-0">
            {!isOwner ? (
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
            ) : null}
            <PageHeroUnsplash
              bleedBottomMargin={false}
              bleedToMainTop={isOwner}
              customBackgroundUrl={(wishlist.cover_art_url ?? "").trim() || null}
            >
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
                        className="mt-1.5 h-5 w-5 shrink-0 text-kurator-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:mt-2 md:h-6 md:w-6"
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
                      <MarkdownRichEditor
                        value={editDesc}
                        onChange={setEditDesc}
                        variant="full"
                        disabled={savingSettings}
                        focusTick={descFocusTick}
                        aria-label="Wishlist description"
                        placeholder="Describe this wishlist…"
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
                      className="group mt-2 flex w-fit max-w-3xl items-start gap-2 rounded-lg text-left outline-hidden ring-kurator-accent hover:bg-kurator-border/40 focus-visible:ring-2 disabled:opacity-50"
                    >
                      <span className="min-w-0 text-left text-sm leading-relaxed text-kurator-muted group-hover:text-kurator-fg/90">
                        {(wishlist.description ?? "").trim() ? (
                          <MarkdownBody markdown={wishlist.description ?? ""} />
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
                  wishlist.description?.trim() && (
                    <div className="mt-2 max-w-3xl text-sm text-kurator-muted">
                      <MarkdownBody markdown={wishlist.description} />
                    </div>
                  )
                )}

                <p className="mt-2 text-xs text-kurator-muted">
                  Shelf Type:{" "}
                  <span className="font-medium text-kurator-fg">Wishlist</span>
                </p>
                {wishlist.author ? (
                  <div className="mt-2">
                    <ShelfAuthorLink author={wishlist.author} variant="avatarAndName" />
                  </div>
                ) : null}

                {!isOwner &&
                  user &&
                  wishlist.is_shared && (
                    <div className="mt-3 rounded-lg border border-kurator-border/80 bg-kurator-bg/40 px-3 py-2">
                      <p className="text-xs text-kurator-muted">
                        This wishlist is shared. Request access to add or remove wished items.
                      </p>
                      <button
                        type="button"
                        disabled={joinWishlistBusy}
                        onClick={async () => {
                          setJoinWishlistMsg(null);
                          setJoinWishlistBusy(true);
                          try {
                            await requestShelfJoin({
                              shelf_kind: "wishlist",
                              shelf_id: wishlist.id,
                            });
                            setJoinWishlistMsg(
                              "Request sent. The owner can approve it from their notifications.",
                            );
                          } catch (err) {
                            setJoinWishlistMsg(
                              err instanceof Error ? err.message : "Could not send request.",
                            );
                          } finally {
                            setJoinWishlistBusy(false);
                          }
                        }}
                        className="mt-2 rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                      >
                        {joinWishlistBusy ? "Sending…" : "Request to join"}
                      </button>
                      {joinWishlistMsg ? (
                        <p className="mt-2 text-xs text-kurator-muted" role="status">
                          {joinWishlistMsg}
                        </p>
                      ) : null}
                    </div>
                  )}

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
                {!canEditEntries && (
                  <p className="mt-2 text-xs text-kurator-muted">
                    {isOwner
                      ? "You can view this list but cannot edit entries."
                      : "You’re viewing another member’s list (read-only)."}
                  </p>
                )}
              </div>
              {(canEditEntries || isOwner) && (
                <div className="flex shrink-0 items-center gap-2">
                  {canEditEntries && (
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
                  )}
                  {isOwner && (
                    <>
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
                    </>
                  )}
                </div>
              )}
            </div>
            </PageHeroUnsplash>
          </header>

          <Link
            href="/wishlists"
            className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All wishlists
          </Link>

          {isOwner && (
            <WishlistSettingsModal
              open={wishlistSettingsModalOpen}
              onOpenChange={setWishlistSettingsModalOpen}
            >
              <div className="space-y-6">
                <div className="rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
                  <p className="mb-3 text-sm font-medium text-kurator-fg">Cover art</p>
                  <CoverArtField
                    value={wishlist.cover_art_url ?? ""}
                    onChange={(url) => void saveWishlistCover(url)}
                    disabled={savingSettings}
                  />
                </div>

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
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-fg">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!wishlist.is_shared}
                      disabled={shareToggleBusy}
                      onChange={async (e) => {
                        setShareShelfMsg(null);
                        setShareToggleBusy(true);
                        try {
                          const updated = await updateWishlist(id, {
                            ...wishlistStableUpdateBody(wishlist),
                            is_shared: e.target.checked,
                          });
                          setWishlist(updated);
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
                      <span className="font-medium">Shared wishlist</span>
                      <span className="mt-0.5 block text-xs text-kurator-muted">
                        Collaborators you approve can add entries. Others can
                        request to join from this page.
                      </span>
                    </span>
                  </label>
                  {wishlist.is_shared ? (
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
                          No mutual friends to show.
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
                          const ids = Array.from(shareInviteIds);
                          if (ids.length === 0) return;
                          setShareShelfMsg(null);
                          setShareInviteBusy(true);
                          try {
                            const updated = await updateWishlist(id, {
                              ...wishlistStableUpdateBody(wishlist),
                              invite_user_ids: ids,
                            });
                            setWishlist(updated);
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
                      aria-label="Columns: title, category, optional id (to update an entry already on this list), optional metadata (JSON), optional purchase_url. Shelf exports with rating or consumption columns can be imported here; those columns are ignored."
                    >
                      <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span
                      role="tooltip"
                      className="pointer-events-none invisible absolute bottom-full left-0 z-60 mb-1.5 w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-kurator-border bg-kurator-bg px-2.5 py-1.5 text-xs leading-snug text-kurator-fg opacity-0 shadow-md transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                    >
                      Columns: title, category, optional id (to update an entry
                      already on this list), optional metadata (JSON), optional
                      purchase_url. Shelf exports with rating or consumption
                      columns can be imported here; those columns are ignored.
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
            canEditEntries ? (
              <button
                type="button"
                onClick={() => setAddWishlistModalOpen(true)}
                aria-haspopup="dialog"
                className="mb-8 w-full rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted transition hover:border-kurator-accent/40 hover:bg-kurator-border/20 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                Nothing on this list yet. Click to add an item.
              </button>
            ) : (
              <p className="mb-8 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
                Nothing on this list yet.
              </p>
            )
          ) : (
            <>
              <div className="mb-4 flex justify-end">
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
              {viewMode === "tiles" ? (
                <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {entries.map((item) => {
                    const cover = getCoverArtUrl(item.metadata);
                    return (
                      <li key={item.id}>
                        <div
                          className={`flex h-full min-h-70 flex-col rounded-xl border border-kurator-border bg-kurator-surface shadow-surface ${entryMotionClass(item.id)}`}
                        >
                          <div className="shrink-0 space-y-2 p-4 pb-2">
                            <h2 className="kurator-item-title line-clamp-2 text-base font-medium leading-snug text-kurator-fg">
                              {item.title}
                            </h2>
                            <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                              {categoryLabel(item.category)}
                            </span>
                            {(item.purchase_url ?? "").trim() !== "" &&
                              purchaseEditId !== item.id && (
                                <a
                                  href={item.purchase_url!.trim()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-kurator-accent hover:underline"
                                >
                                  <ExternalLink
                                    className="h-3.5 w-3.5 shrink-0"
                                    aria-hidden
                                  />
                                  Where to buy
                                </a>
                              )}
                          </div>
                          <div className="mt-auto flex flex-1 flex-col justify-end p-4 pt-2">
                            <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
                              <ItemCoverImage
                                url={cover}
                                alt={`Cover for ${item.title}`}
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            </div>
                            {canEditEntries && (
                              <WishlistEntryEditControls
                                item={item}
                                collections={collections}
                                entryObtainColl={entryObtainColl}
                                setEntryObtainColl={setEntryObtainColl}
                                destCollectionId={destCollectionId}
                                purchaseEditId={purchaseEditId}
                                purchaseEditValue={purchaseEditValue}
                                setPurchaseEditValue={setPurchaseEditValue}
                                purchaseSaveBusy={purchaseSaveBusy}
                                purchaseEditMsg={purchaseEditMsg}
                                startPurchaseEdit={startPurchaseEdit}
                                cancelPurchaseEdit={cancelPurchaseEdit}
                                savePurchaseEdit={savePurchaseEdit}
                                obtainBusy={obtainBusy}
                                onObtain={onObtain}
                                onRemoveEntry={onRemoveEntry}
                                resolveObtainCollectionId={
                                  resolveObtainCollectionId
                                }
                              />
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="mb-8 space-y-3">
                  {entries.map((item) => {
                    const cover = getCoverArtUrl(item.metadata);
                    return (
                      <li key={item.id}>
                        <div
                          className={`rounded-xl border border-kurator-border bg-kurator-surface shadow-surface ${entryMotionClass(item.id)}`}
                        >
                          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
                            <div className="flex min-w-0 flex-1 gap-4">
                              <div className="relative aspect-2/3 w-20 shrink-0 overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
                                <ItemCoverImage
                                  url={cover}
                                  alt={`Cover for ${item.title}`}
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 space-y-2">
                                <h2 className="kurator-item-title line-clamp-2 text-base font-medium leading-snug text-kurator-fg">
                                  {item.title}
                                </h2>
                                <span className="inline-flex rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                                  {categoryLabel(item.category)}
                                </span>
                                {(item.purchase_url ?? "").trim() !== "" &&
                                  purchaseEditId !== item.id && (
                                    <a
                                      href={item.purchase_url!.trim()}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-kurator-accent hover:underline"
                                    >
                                      <ExternalLink
                                        className="h-3.5 w-3.5 shrink-0"
                                        aria-hidden
                                      />
                                      Where to buy
                                    </a>
                                  )}
                              </div>
                            </div>
                            {canEditEntries && (
                              <WishlistEntryEditControls
                                item={item}
                                collections={collections}
                                entryObtainColl={entryObtainColl}
                                setEntryObtainColl={setEntryObtainColl}
                                destCollectionId={destCollectionId}
                                purchaseEditId={purchaseEditId}
                                purchaseEditValue={purchaseEditValue}
                                setPurchaseEditValue={setPurchaseEditValue}
                                purchaseSaveBusy={purchaseSaveBusy}
                                purchaseEditMsg={purchaseEditMsg}
                                startPurchaseEdit={startPurchaseEdit}
                                cancelPurchaseEdit={cancelPurchaseEdit}
                                savePurchaseEdit={savePurchaseEdit}
                                obtainBusy={obtainBusy}
                                onObtain={onObtain}
                                onRemoveEntry={onRemoveEntry}
                                resolveObtainCollectionId={
                                  resolveObtainCollectionId
                                }
                                className="min-w-0 flex-1 space-y-2 border-t border-kurator-border/60 pt-4 lg:min-w-72 lg:border-t-0 lg:border-l lg:border-kurator-border/60 lg:pl-4 lg:pt-0"
                              />
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {canEditEntries && (
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

                <label className="block text-sm">
                  <span className="text-kurator-muted">
                    Purchase link{" "}
                    <span className="font-normal text-kurator-muted/80">
                      (optional)
                    </span>
                  </span>
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://amazon.com/… or https://ebay.com/…"
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                    value={addPurchaseUrl}
                    onChange={(e) => setAddPurchaseUrl(e.target.value)}
                  />
                </label>

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
