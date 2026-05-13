"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock, Plus, Settings, Trash2, Users } from "lucide-react";
import {
  addListItem,
  DEFAULT_VISIBILITY,
  fetchItems,
  fetchList,
  fetchListItems,
  fetchMyFriends,
  removeListItem,
  requestShelfJoin,
  updateList,
  visibilityLabel,
  visibilityOf,
  type Item,
  type List,
  type PublicUser,
  type Visibility,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { CoverArtField } from "@/components/CoverArtField";
import { DeleteEntryBucketDialog } from "@/components/DeleteEntryBucketDialog";
import { WishlistAddEntryModal } from "@/components/WishlistAddEntryModal";
import { WishlistSettingsModal } from "@/components/WishlistSettingsModal";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { VisibilitySelect } from "@/components/VisibilitySelect";
import { categoryLabel } from "@/lib/categoryLabels";
import { isEntityUuid } from "@/lib/entityId";
import { getCoverArtUrl } from "@/lib/itemDisplay";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";

export function ListDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const idRaw = params.id;
  const id =
    typeof idRaw === "string" && isEntityUuid(idRaw) ? idRaw.trim() : "";

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
  const [editVisibility, setEditVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [listSettingsModalOpen, setListSettingsModalOpen] = useState(false);
  const [addListModalOpen, setAddListModalOpen] = useState(false);
  const [joinListMsg, setJoinListMsg] = useState<string | null>(null);
  const [joinListBusy, setJoinListBusy] = useState(false);
  const [editIsShared, setEditIsShared] = useState(false);
  const [shareFriends, setShareFriends] = useState<PublicUser[]>([]);
  const [shareFriendsLoading, setShareFriendsLoading] = useState(false);
  const [shareInviteIds, setShareInviteIds] = useState<Set<number>>(
    () => new Set(),
  );
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
        setEditVisibility(visibilityOf(lst));
        setEditIsShared(!!lst.is_shared);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load list."),
      )
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

  useEffect(() => {
    if (!listSettingsModalOpen || !user) return;
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
  }, [listSettingsModalOpen, user]);

  useEffect(() => {
    if (!listSettingsModalOpen) setShareInviteIds(new Set());
  }, [listSettingsModalOpen]);

  const isOwner =
    list != null && user != null && Number(list.user_id) === Number(user.id);

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
      const inviteIds = Array.from(shareInviteIds);
      const updated = await updateList(id, {
        name,
        description,
        visibility: editVisibility,
        is_public: editVisibility !== "private",
        cover_art_url: coverTrim === "" ? "" : coverTrim,
        is_shared: editIsShared,
        ...(inviteIds.length > 0 ? { invite_user_ids: inviteIds } : {}),
      });
      setList(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditVisibility(visibilityOf(updated));
      setEditIsShared(!!updated.is_shared);
      setShareInviteIds(new Set());
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
        visibility: editVisibility,
        is_public: editVisibility !== "private",
        cover_art_url: url.trim() === "" ? "" : url.trim(),
        is_shared: editIsShared,
      });
      setList(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditVisibility(visibilityOf(updated));
      setEditIsShared(!!updated.is_shared);
      setMetaMsg("Cover saved.");
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
    return (
      <div className="mx-auto max-w-5xl">
        <Link
          href="/lists"
          className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All lists
        </Link>
        <p className="text-sm text-kurator-muted">Loading…</p>
      </div>
    );
  }

  if (error && !list) {
    return (
      <div className="space-y-4">
        <p
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
        <Link
          href="/lists"
          className="text-sm text-kurator-accent hover:underline"
        >
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
          <WishlistSettingsModal
            open={listSettingsModalOpen}
            onOpenChange={setListSettingsModalOpen}
            title="List settings"
            titleId="list-settings-dialog-title"
          >
            <div className="mb-4 rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
              <p className="mb-3 text-sm font-medium text-kurator-fg">Cover art</p>
              <CoverArtField
                value={list.cover_art_url ?? ""}
                onChange={(url) => void saveListCoverArt(url)}
                disabled={savingMeta}
              />
            </div>
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
              <VisibilitySelect
                name="list-settings-visibility"
                legend="Visibility"
                value={editVisibility}
                onChange={setEditVisibility}
              />
              <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-fg">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={editIsShared}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setEditIsShared(v);
                    if (!v) setShareInviteIds(new Set());
                  }}
                />
                <span>
                  <span className="font-medium">Shared list</span>
                  <span className="mt-0.5 block text-xs text-kurator-muted">
                    Collaborators you approve can add items from shelves they
                    curate. Save settings to apply; then send optional invites
                    below.
                  </span>
                </span>
              </label>
              {editIsShared ? (
                <div className="rounded-lg border border-kurator-border/80 bg-kurator-bg/30 p-3">
                  <p className="text-xs font-medium text-kurator-muted">
                    Invite mutual friends (optional, saved with &quot;Save
                    Settings&quot;)
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
                </div>
              ) : null}
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
                Recently updated items you can edit. Pick one, then add to this
                list.
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
                  <option value="">
                    {addable.length === 0
                      ? "Nothing new to add"
                      : "Choose an item…"}
                  </option>
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
      {error && (
        <p
          className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      <header className="mb-8 flex flex-col gap-6">
        <PageHeroUnsplash
          bleedBottomMargin={false}
          bleedToMainTop={true}
          customBackgroundUrl={(list.cover_art_url ?? "").trim() || null}
        >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">
              {list.name}
            </h1>
            <p className="mt-2 text-xs text-kurator-muted">
              Shelf Type:{" "}
              <span className="font-medium text-kurator-fg">List</span>
            </p>
            {list.author ? (
              <div className="mt-2">
                <ShelfAuthorLink author={list.author} variant="avatarAndName" />
              </div>
            ) : null}
            {!isOwner &&
              user &&
              list.is_shared && (
                <div className="mt-3 rounded-lg border border-kurator-border/80 bg-kurator-bg/40 px-3 py-2">
                  <p className="text-xs text-kurator-muted">
                    This list is shared. Request access to add items from shelves you curate.
                  </p>
                  <button
                    type="button"
                    disabled={joinListBusy}
                    onClick={async () => {
                      setJoinListMsg(null);
                      setJoinListBusy(true);
                      try {
                        await requestShelfJoin({ shelf_kind: "list", shelf_id: list.id });
                        setJoinListMsg(
                          "Request sent. The list owner can approve it from their notifications.",
                        );
                      } catch (err) {
                        setJoinListMsg(
                          err instanceof Error ? err.message : "Could not send request.",
                        );
                      } finally {
                        setJoinListBusy(false);
                      }
                    }}
                    className="mt-2 rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
                  >
                    {joinListBusy ? "Sending…" : "Request to join"}
                  </button>
                  {joinListMsg ? (
                    <p className="mt-2 text-xs text-kurator-muted" role="status">
                      {joinListMsg}
                    </p>
                  ) : null}
                </div>
              )}
            {list.description ? (
              <p className="mt-2 text-sm text-kurator-muted">
                {list.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-kurator-muted">
              {list.item_count} {list.item_count === 1 ? "item" : "items"} ·
              items can be any category
              {(() => {
                const v = visibilityOf(list);
                const Icon = v === "private" ? Lock : Users;
                return (
                  <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                    <Icon className="h-3 w-3" aria-hidden />
                    {visibilityLabel(v)}
                  </span>
                );
              })()}
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
                aria-label="Add Item from Your Shelves"
                title="Add Item from Your Shelves"
                className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setListSettingsModalOpen(true)}
                aria-haspopup="dialog"
                aria-label="List settings"
                title="List settings"
                className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              >
                <Settings className="h-4 w-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete list"
                title="Delete list"
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
        href="/lists"
        className="mb-6 inline-flex items-center gap-2 text-sm text-kurator-muted hover:text-kurator-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All lists
      </Link>

      {items.length === 0 ? (
        isOwner ? (
          <button
            type="button"
            onClick={() => setAddListModalOpen(true)}
            aria-haspopup="dialog"
            className="mb-8 w-full rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted transition hover:border-kurator-accent/40 hover:bg-kurator-border/20 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
          >
            No items yet. Click to add from your shelves.
          </button>
        ) : (
          <p className="mb-8 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
            Nothing on this list yet.
          </p>
        )
      ) : (
        <ul className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const meta =
              it.metadata &&
              typeof it.metadata === "object" &&
              !Array.isArray(it.metadata)
                ? (it.metadata as Record<string, unknown>)
                : {};
            const cover = getCoverArtUrl(meta);
            return (
              <li key={it.id}>
                <div className="flex h-full min-h-65 flex-col rounded-xl border border-kurator-border bg-kurator-surface p-4 shadow-surface">
                  <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg border border-kurator-border/60 bg-kurator-bg shadow-surface">
                    <ItemCoverImage
                      url={cover}
                      alt={`Cover for ${it.title}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                  <h2 className="kurator-item-title mt-3 line-clamp-2 text-base font-medium text-kurator-fg">
                    {it.title}
                  </h2>
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
