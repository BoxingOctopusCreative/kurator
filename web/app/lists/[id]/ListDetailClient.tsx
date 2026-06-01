"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Globe,
  Globe2,
  Lock,
  Plus,
  PlusSquare,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import {
  addHitlistComment,
  addListItem,
  DEFAULT_VISIBILITY,
  deleteHitlistComment,
  fetchHitlistComments,
  fetchItems,
  fetchList,
  fetchListItems,
  fetchMyFriends,
  removeListEntry,
  requestShelfJoin,
  suggestHitlistSlug,
  unvoteHitlist,
  updateList,
  voteHitlist,
  visibilityLabel,
  visibilityOf,
  type HitlistComment,
  type HitlistDetail,
  type HitlistEntry,
  type Item,
  type PublicUser,
  type Visibility,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { CoverArtField } from "@/components/CoverArtField";
import { DeleteEntryBucketDialog } from "@/components/DeleteEntryBucketDialog";
import { HitlistAddItemModal } from "@/components/HitlistAddItemModal";
import { HitlistAddToAccountButton } from "@/components/HitlistAddToAccountButton";
import { HitlistEntriesSortableList } from "@/components/HitlistEntriesSortableList";
import { HitlistEntryListNoteEditor } from "@/components/HitlistEntryListNoteEditor";
import { HitlistShareButton } from "@/components/HitlistShareButton";
import { HitlistVoteColumn } from "@/components/HitlistVoteColumn";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import { MarkdownBody } from "@/components/MarkdownBody";
import { WishlistAddEntryModal } from "@/components/WishlistAddEntryModal";
import { WishlistSettingsModal } from "@/components/WishlistSettingsModal";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { ShelfAuthorLink } from "@/components/ShelfAuthorLink";
import { VisibilitySelect } from "@/components/VisibilitySelect";
import { categoryLabel } from "@/lib/categoryLabels";
import { isEntityUuid } from "@/lib/entityId";
import {
  assertCollectionOrWishlistName,
  assertLooseMultilineText,
  LIMITS,
} from "@/lib/validation";
import { collectHitlistEntryCoverUrls } from "@/lib/hitlistHeroCollage";
import { useListFlyIn } from "@/lib/useListFlyIn";

export function ListDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const idRaw = params.id;
  const id =
    typeof idRaw === "string" && isEntityUuid(idRaw) ? idRaw.trim() : "";

  const [list, setList] = useState<HitlistDetail | null>(null);
  const [entries, setEntries] = useState<HitlistEntry[]>([]);
  const [mineItems, setMineItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickId, setPickId] = useState<string>("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [slugBaseUnavailable, setSlugBaseUnavailable] = useState(false);
  const [editCommentsEnabled, setEditCommentsEnabled] = useState(true);
  const [editEntriesNumbered, setEditEntriesNumbered] = useState(true);
  const [editVisibility, setEditVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [listSettingsModalOpen, setListSettingsModalOpen] = useState(false);
  const [addListModalOpen, setAddListModalOpen] = useState(false);
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [joinListMsg, setJoinListMsg] = useState<string | null>(null);
  const [joinListBusy, setJoinListBusy] = useState(false);
  const [editIsShared, setEditIsShared] = useState(false);
  const [shareFriends, setShareFriends] = useState<PublicUser[]>([]);
  const [shareFriendsLoading, setShareFriendsLoading] = useState(false);
  const [shareInviteIds, setShareInviteIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [comments, setComments] = useState<HitlistComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);
  const [itemPickQuery, setItemPickQuery] = useState("");
  const [pickComboOpen, setPickComboOpen] = useState(false);

  const { notifyNewItems, entryMotionClass, runWithFlyOut } =
    useListFlyIn(entries);

  const pickSearchRef = useRef<HTMLInputElement>(null);
  const pickComboWrapRef = useRef<HTMLDivElement>(null);
  const listNameInputRef = useRef<HTMLInputElement>(null);
  const commentFormRef = useRef<HTMLFormElement>(null);

  const loadAll = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchList(id),
      fetchListItems(id),
      fetchItems({ scope: "mine", limit: 200 }).catch(() => [] as Item[]),
    ])
      .then(([lst, ent, mine]) => {
        setList(lst);
        setEntries(ent);
        setMineItems(mine);
        setEditName(lst.name);
        setEditDesc(lst.description ?? "");
        setEditSlug((lst.slug ?? "").trim());
        setEditCommentsEnabled(lst.comments_enabled !== false);
        setEditEntriesNumbered(lst.entries_numbered !== false);
        setEditVisibility(visibilityOf(lst));
        setEditIsShared(!!lst.is_shared);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load list."),
      )
      .finally(() => setLoading(false));
  }, [id]);

  async function refreshEntriesAndList(opts?: { flyInNew?: boolean }) {
    if (!id) return;
    const [ent, mine] = await Promise.all([
      fetchListItems(id),
      fetchItems({ scope: "mine", limit: 200 }).catch(() => [] as Item[]),
    ]);
    setEntries(ent);
    notifyNewItems(ent, opts?.flyInNew);
    setMineItems(mine);
    const lst = await fetchList(id);
    setList(lst);
  }

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Narrow deps: avoid refetching comments when unrelated list fields (e.g. vote_count) update.
  useEffect(() => {
    if (!id || !list) return;
    if (list.comments_enabled === false) {
      setComments([]);
      return;
    }
    let cancelled = false;
    fetchHitlistComments(id)
      .then((c) => {
        if (!cancelled) setComments(c);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- narrow deps; see comment above
  }, [id, list?.id, list?.comments_enabled]);

  useEffect(() => {
    if (!addListModalOpen) {
      setItemPickQuery("");
      setPickId("");
      setPickComboOpen(false);
      return;
    }
    setItemPickQuery("");
    setPickId("");
    setPickComboOpen(false);
    requestAnimationFrame(() => {
      pickSearchRef.current?.focus();
    });
  }, [addListModalOpen]);

  useEffect(() => {
    if (!pickComboOpen || !addListModalOpen) return;
    function onDocMouseDown(ev: MouseEvent) {
      const el = pickComboWrapRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setPickComboOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pickComboOpen, addListModalOpen]);

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
  const mayEdit = Boolean(user && list?.may_edit_entries);

  const onItemIds = new Set(
    entries.map((e) => e.item?.id).filter((x): x is string => Boolean(x)),
  );
  const addable = mineItems.filter((i) => !onItemIds.has(i.id));
  const filteredAddable = useMemo(() => {
    const q = itemPickQuery.trim().toLowerCase();
    if (!q) return addable;
    return addable.filter((i) => {
      const t = i.title.toLowerCase();
      const cat = categoryLabel(i.category).toLowerCase();
      return t.includes(q) || cat.includes(q);
    });
  }, [addable, itemPickQuery]);

  const heroCollageCoverUrls = useMemo(() => collectHitlistEntryCoverUrls(entries), [entries]);

  async function onAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!id || pickId.trim() === "") return;
    setAddMsg(null);
    setAddBusy(true);
    try {
      await addListItem(id, pickId.trim());
      setPickId("");
      await refreshEntriesAndList({ flyInNew: true });
      setAddListModalOpen(false);
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : "Could not add item.");
    } finally {
      setAddBusy(false);
    }
  }

  async function onRemoveEntry(entry: HitlistEntry) {
    if (!id) return;
    setRemoveBusy(entry.id);
    setError(null);
    try {
      await runWithFlyOut([entry.id], async () => {
        await removeListEntry(id, entry.id);
        setEntries((prev) => prev.filter((x) => x.id !== entry.id));
        const lst = await fetchList(id);
        setList(lst);
      });
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
    if (editVisibility === "public" && editSlug.trim() === "") {
      setMetaMsg("Public hitlists need a URL slug.");
      return;
    }
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
        slug: editSlug.trim(),
        comments_enabled: editCommentsEnabled,
        entries_numbered: editEntriesNumbered,
        ...(inviteIds.length > 0 ? { invite_user_ids: inviteIds } : {}),
      });
      setList(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditSlug((updated.slug ?? "").trim());
      setEditCommentsEnabled(updated.comments_enabled !== false);
      setEditEntriesNumbered(updated.entries_numbered !== false);
      setEditVisibility(visibilityOf(updated));
      setEditIsShared(!!updated.is_shared);
      setShareInviteIds(new Set());
      setMetaMsg("Saved.");
      void fetchHitlistComments(id).then(setComments).catch(() => setComments([]));
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
        slug: editSlug.trim(),
        comments_enabled: editCommentsEnabled,
        entries_numbered: editEntriesNumbered,
      });
      setList(updated);
      setEditName(updated.name);
      setEditDesc(updated.description ?? "");
      setEditSlug((updated.slug ?? "").trim());
      setEditCommentsEnabled(updated.comments_enabled !== false);
      setEditEntriesNumbered(updated.entries_numbered !== false);
      setEditVisibility(visibilityOf(updated));
      setEditIsShared(!!updated.is_shared);
      setMetaMsg("Cover saved.");
    } catch (err) {
      setMetaMsg(err instanceof Error ? err.message : "Could not save cover.");
    } finally {
      setSavingMeta(false);
    }
  }

  async function toggleVote() {
    if (!list || !user || voteBusy) return;
    const prevList = list;
    const wasVoted = !!list.viewer_has_voted;
    setError(null);
    setVoteBusy(true);
    try {
      const stats = wasVoted ? await unvoteHitlist(prevList.id) : await voteHitlist(prevList.id);
      setList((L) =>
        L && L.id === prevList.id
          ? { ...L, vote_count: stats.vote_count, viewer_has_voted: stats.viewer_has_voted }
          : L,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed.");
    } finally {
      setVoteBusy(false);
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !user || commentDraft.trim() === "") return;
    setCommentBusy(true);
    setError(null);
    try {
      await addHitlistComment(id, commentDraft);
      setCommentDraft("");
      const d = await fetchList(id);
      setList(d);
      const cm = await fetchHitlistComments(id);
      setComments(cm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment.");
    } finally {
      setCommentBusy(false);
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
          All hitlists
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
          All hitlists
        </Link>
      </div>
    );
  }

  if (!list) {
    return null;
  }

  const listVis = visibilityOf(list);
  const permalinkPath =
    listVis === "public" && list.slug?.trim()
      ? `/hitlists/${encodeURIComponent(list.slug.trim())}`
      : null;
  const showEntryNumbers = list.entries_numbered !== false;
  const EntryListTag = showEntryNumbers ? "ol" : "ul";

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
      {(isOwner || mayEdit) && (
        <>
          <WishlistAddEntryModal
            open={addListModalOpen}
            onOpenChange={setAddListModalOpen}
            title="Add from your shelves"
          >
            <form onSubmit={onAddItem} className="space-y-4">
              <p className="text-xs text-kurator-muted">
                Recently updated items you can edit. Pick one, then add to this hitlist.
              </p>
              <div ref={pickComboWrapRef} className="relative">
                <label className="block text-sm">
                  <span className="text-kurator-muted">Item</span>
                  <input
                    ref={pickSearchRef}
                    id="hitlist-add-item-combobox"
                    type="text"
                    role="combobox"
                    aria-expanded={pickComboOpen}
                    aria-controls="hitlist-pick-listbox"
                    aria-autocomplete="list"
                    value={itemPickQuery}
                    onChange={(e) => {
                      setItemPickQuery(e.target.value);
                      setPickId("");
                      setPickComboOpen(true);
                    }}
                    onFocus={() => {
                      if (addable.length > 0) setPickComboOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && pickComboOpen) {
                        setPickComboOpen(false);
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    placeholder={
                      addable.length === 0
                        ? "Nothing new to add"
                        : "Search by title…"
                    }
                    disabled={addable.length === 0}
                    autoComplete="off"
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  />
                </label>
                {pickComboOpen && addable.length > 0 ? (
                  <ul
                    id="hitlist-pick-listbox"
                    role="listbox"
                    className="absolute top-full left-0 right-0 z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-kurator-border bg-kurator-bg py-1 shadow-lg"
                  >
                    {filteredAddable.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-kurator-muted">
                        No matches
                      </li>
                    ) : (
                      filteredAddable.map((i) => (
                        <li key={i.id} role="option" aria-selected={pickId === i.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-kurator-fg hover:bg-kurator-border/40 focus-visible:bg-kurator-border/40 focus-visible:outline-hidden"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setPickId(i.id);
                              setItemPickQuery(
                                `${i.title} (${categoryLabel(i.category)})`,
                              );
                              setPickComboOpen(false);
                            }}
                          >
                            {i.title}{" "}
                            <span className="text-kurator-muted">
                              ({categoryLabel(i.category)})
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={addBusy || pickId.trim() === ""}
                className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
              >
                {addBusy ? "Adding…" : "Add to hitlist"}
              </button>
              {addMsg && (
                <p className="text-xs text-amber-200/90" role="alert">
                  {addMsg}
                </p>
              )}
            </form>
          </WishlistAddEntryModal>
          <HitlistAddItemModal
            hitlistId={id}
            open={newItemModalOpen}
            onOpenChange={setNewItemModalOpen}
            onComplete={() => void refreshEntriesAndList({ flyInNew: true })}
          />
        </>
      )}
      {isOwner && (
        <>
          <WishlistSettingsModal
            open={listSettingsModalOpen}
            onOpenChange={setListSettingsModalOpen}
            title="Hitlist settings"
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
                <div className="mt-1">
                  <MarkdownRichEditor
                    value={editDesc}
                    onChange={setEditDesc}
                    variant="full"
                    disabled={savingMeta}
                    placeholder="Optional (supports lists, links, emphasis…)"
                  />
                </div>
              </label>
              <VisibilitySelect
                name="list-settings-visibility"
                legend="Visibility"
                value={editVisibility}
                onChange={(v) => {
                  setEditVisibility(v);
                  if (v !== "public") {
                    setSlugBaseUnavailable(false);
                  }
                  if (v === "public" && editSlug.trim() === "") {
                    void (async () => {
                      try {
                        const sug = await suggestHitlistSlug({
                          stem: editName.trim() || "hitlist",
                          exclude_list_id: id,
                        });
                        setSlugBaseUnavailable(!sug.available);
                        setEditSlug(sug.available ? sug.slug : (sug.suggested ?? sug.slug));
                      } catch {
                        /* ignore */
                      }
                    })();
                  }
                }}
              />
              <div className="space-y-2 rounded-lg border border-kurator-border/80 bg-kurator-bg/30 p-3">
                <label className="block text-sm">
                  <span className="text-kurator-muted">URL slug (permalink)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    placeholder="my-awesome-list"
                    aria-describedby="list-settings-slug-hint"
                  />
                </label>
                <p id="list-settings-slug-hint" className="text-xs text-kurator-muted">
                  {editVisibility === "public" ? (
                    <>
                      This slug is your public share link:{" "}
                      <span className="font-mono text-kurator-fg/90">
                        /hitlists/{editSlug.trim() || "…"}
                      </span>
                      . It must be set and unique before saving.
                    </>
                  ) : (
                    <>
                      Set or change your slug anytime. It becomes a live permalink at{" "}
                      <span className="font-mono text-kurator-fg/90">
                        /hitlists/{editSlug.trim() || "…"}
                      </span>{" "}
                      only when visibility is <span className="text-kurator-fg">Public</span> (leave blank
                      to clear).
                    </>
                  )}
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-kurator-accent hover:underline"
                  onClick={async () => {
                    try {
                      const sug = await suggestHitlistSlug({
                        stem: editName.trim() || "hitlist",
                        exclude_list_id: id,
                        alternate: slugBaseUnavailable,
                      });
                      if (!sug.available) {
                        setSlugBaseUnavailable(true);
                      }
                      setEditSlug(sug.available ? sug.slug : (sug.suggested ?? sug.slug));
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Suggest available slug
                </button>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-fg">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={editCommentsEnabled}
                  onChange={(e) => setEditCommentsEnabled(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Allow comments</span>
                  <span className="mt-0.5 block text-xs text-kurator-muted">
                    When off, existing comments are hidden and new comments are blocked.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-fg">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={editEntriesNumbered}
                  onChange={(e) => setEditEntriesNumbered(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Numbered entries</span>
                  <span className="mt-0.5 block text-xs text-kurator-muted">
                    Off for an unordered list (no rank column). On for ordered-style numbering.
                  </span>
                </span>
              </label>
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
                  <span className="font-medium">Shared hitlist</span>
                  <span className="mt-0.5 block text-xs text-kurator-muted">
                    Collaborators you approve can add items from shelves they curate. Save settings
                    to apply; then send optional invites below.
                  </span>
                </span>
              </label>
              {editIsShared ? (
                <div className="rounded-lg border border-kurator-border/80 bg-kurator-bg/30 p-3">
                  <p className="text-xs font-medium text-kurator-muted">
                    Invite mutual friends (optional, saved with &quot;Save Settings&quot;)
                  </p>
                  {shareFriendsLoading ? (
                    <p className="mt-2 text-xs text-kurator-muted">Loading friends…</p>
                  ) : shareFriends.length === 0 ? (
                    <p className="mt-2 text-xs text-kurator-muted">No mutual friends to show.</p>
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
              <div className="flex justify-end gap-2 pt-2">
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
          collageCoverUrls={heroCollageCoverUrls}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold text-kurator-fg md:text-3xl">
                {list.name}
              </h1>
              <p className="mt-2 text-xs text-kurator-muted">
                Shelf type:{" "}
                <span className="font-medium text-kurator-fg">Hitlist</span>
              </p>
              {list.author ? (
                <div className="mt-2">
                  <ShelfAuthorLink author={list.author} variant="avatarAndName" />
                </div>
              ) : null}
              {!isOwner && user && list.is_shared && (
                <div className="mt-3 rounded-lg border border-kurator-border/80 bg-kurator-bg/40 px-3 py-2">
                  <p className="text-xs text-kurator-muted">
                    This hitlist is shared. Request access to add items from shelves you curate.
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
                          "Request sent. The owner can approve it from their notifications.",
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
              {list.description?.trim() ? (
                <div className="relative mt-3">
                  <div className="pe-[5.75rem] sm:pe-28">
                    <MarkdownBody markdown={list.description} />
                  </div>
                  <div className="pointer-events-auto absolute end-0 bottom-0">
                    <HitlistVoteColumn
                      voteCount={list.vote_count ?? 0}
                      viewerHasVoted={list.viewer_has_voted ?? false}
                      canVote={!!user}
                      busy={voteBusy}
                      onVoteToggle={() => void toggleVote()}
                    />
                  </div>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-kurator-muted">
                <span>
                  {list.item_count} {list.item_count === 1 ? "entry" : "entries"}
                </span>
                {listVis === "public" && permalinkPath ? (
                  <HitlistShareButton permalinkPath={permalinkPath} listName={list.name} />
                ) : null}
                <span className="inline-flex items-center gap-0.5 rounded-full bg-kurator-border/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kurator-muted">
                  {(() => {
                    const Icon =
                      listVis === "private"
                        ? Lock
                        : listVis === "public"
                          ? Globe
                          : listVis === "friends"
                            ? Globe2
                            : Users;
                    return <Icon className="h-3 w-3" aria-hidden />;
                  })()}
                  {visibilityLabel(listVis)}
                </span>
                {!list.description?.trim() ? (
                  <span className="ms-auto shrink-0">
                    <HitlistVoteColumn
                      voteCount={list.vote_count ?? 0}
                      viewerHasVoted={list.viewer_has_voted ?? false}
                      canVote={!!user}
                      busy={voteBusy}
                      onVoteToggle={() => void toggleVote()}
                    />
                  </span>
                ) : null}
              </div>
              {isOwner && metaMsg && (
                <p className="mt-2 text-sm text-kurator-muted" role="status">
                  {metaMsg}
                </p>
              )}
            </div>
            {(isOwner || mayEdit) && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddListModalOpen(true)}
                  aria-haspopup="dialog"
                  aria-label="Add item from your shelves"
                  title="Add item from your shelves"
                  className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                >
                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setNewItemModalOpen(true)}
                  aria-haspopup="dialog"
                  aria-label="Create new item and add to hitlist"
                  title="Create new item and add to hitlist"
                  className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                >
                  <PlusSquare className="h-4 w-4 shrink-0" aria-hidden />
                </button>
                {isOwner ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setListSettingsModalOpen(true)}
                      aria-haspopup="dialog"
                      aria-label="Hitlist settings"
                      title="Hitlist settings"
                      className="rounded-lg p-2 text-kurator-fg hover:bg-kurator-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
                    >
                      <Settings className="h-4 w-4 shrink-0" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteOpen(true)}
                      aria-label="Delete hitlist"
                      title="Delete hitlist"
                      className="rounded-lg p-2 text-red-200 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                    </button>
                  </>
                ) : null}
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
        All hitlists
      </Link>

      {entries.length === 0 ? (
        mayEdit || isOwner ? (
          <button
            type="button"
            onClick={() => setNewItemModalOpen(true)}
            aria-haspopup="dialog"
            aria-label="Create new item and add to hitlist"
            title="Create new item and add to hitlist"
            className="mb-8 w-full rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted transition hover:border-kurator-accent/40 hover:bg-kurator-border/20 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
          >
            No entries yet. Click here to create a new item and add it to this hitlist, or use the + in
            the header to pick from your shelves.
          </button>
        ) : (
          <p className="mb-8 rounded-xl shadow-surface border border-kurator-border bg-kurator-surface px-4 py-8 text-center text-sm text-kurator-muted">
            Nothing on this hitlist yet.
          </p>
        )
      ) : (
        <HitlistEntriesSortableList
          listId={id}
          entries={entries}
          setEntries={setEntries}
          showNumbers={showEntryNumbers}
          canReorder={Boolean(mayEdit || isOwner)}
          listTag={EntryListTag}
          listClassName="mb-8 list-none space-y-2 p-0"
          entryFlyInClass={entryMotionClass}
          getExtras={(entry) => ({
            belowTitle: (
              <>
                {entry.item?.collection_id?.trim() && (mayEdit || isOwner) ? (
                  <HitlistEntryListNoteEditor
                    listId={id}
                    entry={entry}
                    onUpdated={(entryId, description) => {
                      setEntries((prev) =>
                        prev.map((e) => (e.id === entryId ? { ...e, description } : e)),
                      );
                    }}
                  />
                ) : null}
                {user || entry.item?.collection_id?.trim() ? (
                  <HitlistAddToAccountButton entry={entry} />
                ) : null}
              </>
            ),
            actions:
              mayEdit || isOwner ? (
                <button
                  type="button"
                  disabled={removeBusy === entry.id}
                  onClick={() => void onRemoveEntry(entry)}
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {removeBusy === entry.id ? "Removing…" : "Remove"}
                </button>
              ) : undefined,
          })}
        />
      )}

      {list.comments_enabled !== false ? (
        <section className="mb-12 rounded-xl border border-kurator-border bg-kurator-surface/60 p-4 shadow-surface">
          <h2 className="text-lg font-medium text-kurator-fg">Comments</h2>
          {user ? (
            <form
              ref={commentFormRef}
              onSubmit={(e) => void submitComment(e)}
              className="mt-3 space-y-2"
            >
              <MarkdownRichEditor
                value={commentDraft}
                onChange={setCommentDraft}
                variant="compact"
                disabled={commentBusy}
                placeholder="Write a comment…"
                aria-label="Comment"
                onCancelChord={() => setCommentDraft("")}
                onSaveChord={() => commentFormRef.current?.requestSubmit()}
              />
              <button
                type="submit"
                disabled={commentBusy || commentDraft.trim() === ""}
                className="rounded-lg bg-kurator-accent px-3 py-1.5 text-xs font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
              >
                {commentBusy ? "Posting…" : "Post"}
              </button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-kurator-muted">Sign in to comment.</p>
          )}
          <ul className="mt-4 space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-kurator-border/70 bg-kurator-bg/40 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {c.author ? (
                    <ShelfAuthorLink author={c.author} variant="avatarAndName" />
                  ) : (
                    <span className="text-xs text-kurator-muted">User #{c.user_id}</span>
                  )}
                  {user && (Number(user.id) === c.user_id || isOwner) ? (
                    <button
                      type="button"
                      className="text-[11px] text-red-300 hover:underline"
                      onClick={async () => {
                        if (!id) return;
                        try {
                          await deleteHitlistComment(id, c.id);
                          const cm = await fetchHitlistComments(id);
                          setComments(cm);
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 text-kurator-muted">
                  <MarkdownBody markdown={c.body} />
                </div>
              </li>
            ))}
          </ul>
          {comments.length === 0 ? (
            <p className="mt-3 text-xs text-kurator-muted">No comments yet.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
