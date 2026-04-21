"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, Settings, Trash2 } from "lucide-react";
import {
  addListItem,
  fetchItems,
  fetchList,
  fetchListItems,
  removeListItem,
  updateList,
  type Item,
  type List,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { CoverArtEditModal } from "@/components/CoverArtEditModal";
import { DeleteEntryBucketDialog } from "@/components/DeleteEntryBucketDialog";
import { WishlistAddEntryModal } from "@/components/WishlistAddEntryModal";
import { WishlistSettingsModal } from "@/components/WishlistSettingsModal";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { categoryLabel } from "@/lib/categoryLabels";
import { isEntityUuid } from "@/lib/entityId";
import { getCoverArtUrl } from "@/lib/itemDisplay";
import { assertCollectionOrWishlistName, assertLooseMultilineText, LIMITS } from "@/lib/validation";

export function ListDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const idRaw = params.id;
  const id = typeof idRaw === "string" && isEntityUuid(idRaw) ? idRaw.trim() : "";

  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [mineItems, setMineItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickId, setPickId] = useState<string>("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPublic, setEditPublic] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [coverArtModalOpen, setCoverArtModalOpen] = useState(false);
  const [listSettingsModalOpen, setListSettingsModalOpen] = useState(false);
  const [addListModalOpen, setAddListModalOpen] = useState(false);
  const pickSelectRef = useRef<HTMLSelectElement>(null);
  const listNameInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchList(id),
      fetchListItems(id),
      fetchItems({ scope: "mine", limit: 200 }).catch(() => [] as Item[]),
    ])
      .then(([lst, its, mine]) => {
        setList(lst);
        setItems(its);
        setMineItems(mine);
        setEditName(lst.name);
        setEditDesc(lst.description ?? "");
        setEditPublic(lst.is_public !== false);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load list."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!addListModalOpen) return;
    requestAnimationFrame(() => {
      pickSelectRef.current?.focus();
    });
  }, [addListModalOpen]);

  useEffect(() => {
    if (!listSettingsModalOpen) return;
    requestAnimationFrame(() => {
      listNameInputRef.current?.focus();
    });
  }, [listSettingsModalOpen]);

  const isOwner = list != null && user != null && Number(list.user_id) === Number(user.id);

  const onIds = new Set(items.map((i) => i.id));
  const addable = mineItems.filter((i) => !onIds.has(i.id));

  async function onAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!id || pickId.trim() === "") return;
    setAddMsg(null);
    setAddBusy(true);
    try {
      await addListItem(id, pickId.trim());
      setPickId("");
      const [its, mine] = await Promise.all([
        fetchListItems(id),
        fetchItems({ scope: "mine", limit: 200 }).catch(() => [] as Item[]),
      ]);
      setItems(its);
      setMineItems(mine);
      const lst = await fetchList(id);
      setList(lst);
      setAddListModalOpen(false);
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : "Could not add item.");
    } finally {
      setAddBusy(false);
    }
  }

  async function onRemove(it: Item) {
    if (!id) return;
    setRemoveBusy(it.id);
    setError(null);
    try {
      await removeListItem(id, it.id);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      const lst = await fetchList(id);
      setList(lst);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setRemoveBusy(null);
    }
  }

  async function onSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !list || !isOwner) return;
    setMetaMsg(null);
    setSavingMeta(true);
    try {
      const name = assertCollectionOrWishlistName(editName, "List name");
      const descRaw = editDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(editDesc, LIMITS.description, "Description")
        : "";
      const coverTrim = (list.cover_art_url ?? "").trim();
      const updated = await updateList(id, {
        name,
        description,
        is_public: editPublic,
        cover_art_url: coverTrim === "" ? "" : coverTrim,
      });
      setList(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditPublic(updated.is_public !== false);
      setMetaMsg("Saved.");
    } catch (err) {
      setMetaMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingMeta(false);
    }
  }

  async function saveListCoverArt(url: string) {
    if (!id || !list || !isOwner) return;
    setMetaMsg(null);
    setSavingMeta(true);
    try {
      const name = assertCollectionOrWishlistName(editName, "List name");
      const descRaw = editDesc.trim();
      const description = descRaw
        ? assertLooseMultilineText(editDesc, LIMITS.description, "Description")
        : "";
      const updated = await updateList(id, {
        name,
        description,
        is_public: editPublic,
        cover_art_url: url.trim() === "" ? "" : url.trim(),
      });
      setList(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditPublic(updated.is_public !== false);
      setMetaMsg("Cover saved.");
      setCoverArtModalOpen(false);
    } catch (err) {
      setMetaMsg(err instanceof Error ? err.message : "Could not save cover.");
    } finally {
      setSavingMeta(false);
    }
  }

  if (!id) {
    return (
      <p className="text-sm text-red-400" role="alert">
        Invalid list.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-kurator-muted">Loading…</p>;
  }

  if (error && !list) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
        <Link href="/lists" className="text-sm text-kurator-accent hover:underline">
          All lists
        </Link>
      </div>
    );
  }

  if (!list) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <DeleteEntryBucketDialog
        variant="list"
        subject={{ id: list.id, name: list.name, entry_count: list.item_count }}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          router.push("/lists", { scroll: false });
          router.refresh();
        }}
      />
      {isOwner && (
        <>
          <CoverArtEditModal
            open={coverArtModalOpen}
            onOpenChange={setCoverArtModalOpen}
            title="List cover art"
            value={list.cover_art_url ?? ""}
            disabled={savingMeta}
            onChange={(url) => void saveListCoverArt(url)}
          />
          <WishlistSettingsModal
            open={listSettingsModalOpen}
            onOpenChange={setListSettingsModalOpen}
            title="List settings"
            titleId="list-settings-dialog-title"
          >
            <form onSubmit={onSaveMeta} className="space-y-4">
              <label className="block text-sm">
                <span className="text-kurator-muted">Name</span>
                <input
                  ref={listNameInputRef}
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-kurator-muted">Description</span>
                <input
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-kurator-muted">
                <input
                  type="checkbox"
                  checked={editPublic}
                  onChange={(e) => setEditPublic(e.target.checked)}
                  className="rounded-sm border-kurator-border"
                />
                Public list — other signed-in users can open this list (read-only)
              </label>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={savingMeta}
                  className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                >
                  {savingMeta ? "Saving…" : "Save Settings"}
                </button>
              </div>
            </form>
          </WishlistSettingsModal>
          <WishlistAddEntryModal
            open={addListModalOpen}
            onOpenChange={setAddListModalOpen}
            title="Add from your shelves"
          >
            <form onSubmit={onAddItem} className="space-y-4">
              <p className="text-xs text-kurator-muted">
                Recently updated items you can edit. Pick one, then add to this list.
              </p>
              <label className="block text-sm">
                <span className="text-kurator-muted">Item</span>
                <select
                  ref={pickSelectRef}
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={pickId}
                  onChange={(e) => setPickId(e.target.value)}
                  disabled={addable.length === 0}
                >
                  <option value="">{addable.length === 0 ? "Nothing new to add" : "Choose an item…"}</option>
                  {addable.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title} ({categoryLabel(i.category)})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={addBusy || pickId.trim() === ""}
                className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
              >
                {addBusy ? "Adding…" : "Add to List"}
              </button>
              {addMsg && (
                <p className="text-xs text-amber-200/90" role="alert">
                  {addMsg}
                </p>
              )}
            </form>
          </WishlistAddEntryModal>
        </>
      )}
      <Link
        href="/lists"
        className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All lists
      </Link>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <header className="mb-8 flex flex-col gap-6">
        {(list.cover_art_url?.trim() || isOwner) &&
          (isOwner ? (
            <button
              type="button"
              disabled={savingMeta}
              onClick={() => setCoverArtModalOpen(true)}
              aria-label="Edit cover art"
              className="relative w-full overflow-hidden rounded-xl border border-kurator-border/60 bg-kurator-bg text-left shadow-xs ring-kurator-accent transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
            >
              <div className="relative aspect-5/2 w-full min-h-42 max-h-68 md:aspect-21/9 md:min-h-48 md:max-h-88">
                {list.cover_art_url?.trim() ? (
                  <ItemCoverImage
                    url={list.cover_art_url}
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
                {list.cover_art_url?.trim() ? (
                  <ItemCoverImage
                    url={list.cover_art_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
              </div>
            </div>
          ))}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">{list.name}</h1>
            {list.description ? (
              <p className="mt-2 text-sm text-kurator-muted">{list.description}</p>
            ) : null}
            <p className="mt-2 text-xs text-kurator-muted">
              {list.item_count} {list.item_count === 1 ? "item" : "items"} · items can be any category
              {list.is_public === false ? (
                <span className="ml-2 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                  Private
                </span>
              ) : (
                <span className="ml-2 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                  Public
                </span>
              )}
            </p>
            {isOwner && metaMsg && (
              <p className="mt-2 text-sm text-kurator-muted" role="status">
                {metaMsg}
              </p>
            )}
          </div>
          {isOwner && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setAddListModalOpen(true)}
                aria-haspopup="dialog"
                aria-label="Add item from your shelves"
                title="Add item from your shelves"
                className="rounded-lg border border-kurator-border bg-kurator-bg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setListSettingsModalOpen(true)}
                aria-haspopup="dialog"
                aria-label="List settings"
                title="List settings"
                className="rounded-lg border border-kurator-border bg-kurator-bg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                <Settings className="h-4 w-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete list"
                title="Delete list"
                className="rounded-lg border border-red-500/40 p-2 text-red-200 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        isOwner ? (
          <button
            type="button"
            onClick={() => setAddListModalOpen(true)}
            aria-haspopup="dialog"
            className="mb-8 w-full rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted transition hover:border-kurator-accent/40 hover:bg-kurator-border/20 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
          >
            No items yet. Click to add from your shelves.
          </button>
        ) : (
          <p className="mb-8 rounded-xl border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
            Nothing on this list yet.
          </p>
        )
      ) : (
        <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const meta =
              it.metadata && typeof it.metadata === "object" && !Array.isArray(it.metadata)
                ? (it.metadata as Record<string, unknown>)
                : {};
            const cover = getCoverArtUrl(meta);
            return (
              <li key={it.id}>
                <div className="flex h-full min-h-[260px] flex-col rounded-xl border border-kurator-border bg-kurator-surface p-4 shadow-xs">
                  <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg">
                    <ItemCoverImage
                      url={cover}
                      alt={`Cover for ${it.title}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                  <h2 className="mt-3 line-clamp-2 text-base font-medium text-kurator-fg">{it.title}</h2>
                  <span className="mt-1 inline-flex self-start rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                    {categoryLabel(it.category)}
                  </span>
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    <Link
                      href={`/items/${it.id}`}
                      className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs font-medium text-kurator-accent hover:border-kurator-accent/60"
                    >
                      Open
                    </Link>
                    {isOwner && (
                      <button
                        type="button"
                        disabled={removeBusy === it.id}
                        onClick={() => void onRemove(it)}
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {removeBusy === it.id ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
