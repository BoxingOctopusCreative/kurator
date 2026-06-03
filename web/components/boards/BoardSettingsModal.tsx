"use client";

import { useEffect, useState } from "react";
import { CoverArtField } from "@/components/CoverArtField";
import { KuratorModal } from "@/components/KuratorModal";
import { MarkdownRichEditor } from "@/components/MarkdownRichEditor";
import { boardPath } from "@/lib/boardPaths";
import {
  patchBoard,
  suggestBoardSlug,
  type Board,
  type BoardFlair,
  type BoardVisibility,
} from "@/lib/api";
import { BoardFlairManager } from "@/components/boards/BoardFlairManager";
import { BoardModeratorManager } from "@/components/boards/BoardModeratorManager";
import { assertCollectionOrWishlistName, assertLooseMultilineText, LIMITS } from "@/lib/validation";

type Props = {
  board: Board;
  flairs: BoardFlair[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (board: Board) => void;
  onFlairsChange: () => void;
  /** When the permalink slug changes, navigate to the new URL. */
  onSlugChanged?: (newSlug: string) => void;
};

export function BoardSettingsModal({
  board,
  flairs,
  open,
  onOpenChange,
  onSaved,
  onFlairsChange,
  onSlugChanged,
}: Props) {
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [visibility, setVisibility] = useState<BoardVisibility>(board.visibility);
  const [slug, setSlug] = useState(board.slug);
  const [iconUrl, setIconUrl] = useState(board.icon_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(board.banner_url ?? "");
  const [slugSuggesting, setSlugSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [brandingMsg, setBrandingMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(board.name);
    setDescription(board.description);
    setVisibility(board.visibility);
    setSlug(board.slug);
    setIconUrl(board.icon_url ?? "");
    setBannerUrl(board.banner_url ?? "");
    setFormMsg(null);
    setBrandingMsg(null);
  }, [open, board]);

  async function onSuggestSlug() {
    setSlugSuggesting(true);
    try {
      const sug = await suggestBoardSlug({
        stem: name.trim() || board.name,
        exclude_board_id: board.id,
        alternate: true,
      });
      setSlug(sug.slug);
    } catch {
      /* ignore */
    } finally {
      setSlugSuggesting(false);
    }
  }

  async function saveBranding(patch: { icon_url?: string; banner_url?: string }) {
    setBrandingMsg(null);
    setBrandingBusy(true);
    try {
      const updated = await patchBoard(board.id, patch);
      if (patch.icon_url !== undefined) setIconUrl(updated.icon_url ?? "");
      if (patch.banner_url !== undefined) setBannerUrl(updated.banner_url ?? "");
      onSaved(updated);
    } catch (e) {
      setBrandingMsg(e instanceof Error ? e.message : "Could not save appearance.");
    } finally {
      setBrandingBusy(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setSaving(true);
    try {
      const boardName = assertCollectionOrWishlistName(name, "Board name");
      const desc = assertLooseMultilineText(description, LIMITS.description, "Description");
      const slugTrim = slug.trim();
      const updated = await patchBoard(board.id, {
        name: boardName,
        description: desc,
        visibility,
        slug: slugTrim || board.slug,
      });
      onSaved(updated);
      if (updated.slug !== board.slug) {
        onSlugChanged?.(updated.slug);
      }
      onOpenChange(false);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KuratorModal
      open={open}
      onOpenChange={onOpenChange}
      title="Board settings"
      panelClassName="max-w-2xl w-[min(100%,42rem)] max-h-[min(90vh,52rem)] overflow-y-auto"
    >
      <form onSubmit={(e) => void onSave(e)} className="space-y-6">
        <section className="space-y-4 rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
          <h3 className="text-sm font-medium text-kurator-fg">General</h3>
          <label className="block text-sm">
            <span className="text-kurator-muted">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-kurator-fg"
              required
              maxLength={LIMITS.name}
              disabled={saving}
            />
          </label>
          <div className="block text-sm">
            <span className="text-kurator-muted">Description</span>
            <div className="mt-1">
              <MarkdownRichEditor
                value={description}
                onChange={setDescription}
                variant="full"
                allowImages
                disabled={saving}
                placeholder="What is this board about?"
                aria-label="Board description"
              />
            </div>
          </div>
          <fieldset className="text-sm" disabled={saving}>
            <legend className="text-kurator-muted">Visibility</legend>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="board-settings-vis"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                />
                <span className="text-kurator-fg">Public — anyone signed in can read and post</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="board-settings-vis"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                />
                <span className="text-kurator-fg">Private — invite-only members</span>
              </label>
            </div>
          </fieldset>
          <label className="block text-sm">
            <span className="text-kurator-muted">Permalink</span>
            <p className="mt-0.5 text-xs text-kurator-muted">
              {typeof window !== "undefined" ? window.location.origin : ""}
              {boardPath(slug.trim() || board.slug)}
            </p>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg"
                disabled={saving}
              />
              <button
                type="button"
                onClick={() => void onSuggestSlug()}
                disabled={slugSuggesting || saving}
                className="shrink-0 rounded-lg border border-kurator-border px-3 py-2 text-xs text-kurator-muted hover:bg-kurator-border/30 disabled:opacity-50"
              >
                {slugSuggesting ? "…" : "Suggest"}
              </button>
            </div>
          </label>
          {formMsg ? (
            <p className="text-sm text-red-500" role="alert">
              {formMsg}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || brandingBusy}
              className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </section>
      </form>

      <section className="mt-6 space-y-4 rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
        <BoardModeratorManager boardId={board.id} />
      </section>

      <section className="mt-6 space-y-4 rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
        <BoardFlairManager boardId={board.id} flairs={flairs} onChange={onFlairsChange} />
      </section>

      <section className="mt-6 space-y-4 rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
        <h3 className="text-sm font-medium text-kurator-fg">Appearance</h3>
        <p className="text-xs text-kurator-muted">
          Icon and hero banner save immediately when you pick or remove an image.
        </p>
        <div>
          <p className="mb-2 text-sm text-kurator-muted">Icon</p>
          <CoverArtField
            value={iconUrl}
            onChange={(url) => void saveBranding({ icon_url: url })}
            disabled={brandingBusy || saving}
          />
        </div>
        <div>
          <p className="mb-2 text-sm text-kurator-muted">Hero banner</p>
          <CoverArtField
            value={bannerUrl}
            onChange={(url) => void saveBranding({ banner_url: url })}
            disabled={brandingBusy || saving}
          />
        </div>
        {brandingMsg ? (
          <p className="text-sm text-red-500" role="alert">
            {brandingMsg}
          </p>
        ) : null}
      </section>
    </KuratorModal>
  );
}
