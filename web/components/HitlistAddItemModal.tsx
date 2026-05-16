"use client";

import { useEffect, useRef, useState } from "react";
import {
  CategoryMetadataFields,
  type CategoryFormSlice,
} from "@/components/CategoryMetadataFields";
import { TitleMetadataSearch } from "@/components/TitleMetadataSearch";
import { WishlistAddEntryModal } from "@/components/WishlistAddEntryModal";
import { addListItem, createItem, type Category } from "@/lib/api";
import { buildItemMetadata } from "@/lib/itemMetadata";
import { mergeCategoryFormSlice } from "@/lib/mergeCategoryFormSlice";
import { assertItemTitle } from "@/lib/validation";

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

type Props = {
  hitlistId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void | Promise<void>;
};

/**
 * Hitlist quick-add: creates a standalone catalog item and links it to the list.
 * Cover art comes from title search when you pick a match; no shelf, rating, status, serial, or manual cover UI.
 */
export function HitlistAddItemModal({ hitlistId, open, onOpenChange, onComplete }: Props) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("game");
  const [slice, setSlice] = useState<CategoryFormSlice>({});
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSlice({});
    setMessage(null);
    setStatus("idle");
    setCategory("game");
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setStatus("saving");
    try {
      const safeTitle = assertItemTitle(title);
      const metadata = buildItemMetadata(category, slice);
      const item = await createItem({
        title: safeTitle,
        category,
        collection_id: null,
        metadata,
      });
      await addListItem(hitlistId, item.id);
      await onComplete();
      onOpenChange(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <WishlistAddEntryModal open={open} onOpenChange={onOpenChange} title="Add new item">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
        <p className="text-xs text-kurator-muted">
          Adds a standalone item to this hitlist (not on a shelf). Pick a catalog match below to fill
          details and cover art.
        </p>

        <label className="block text-sm">
          <span className="text-kurator-muted">Category</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              setSlice({});
            }}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-kurator-muted">Title</span>
          <input
            ref={titleInputRef}
            required
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chrono Trigger"
          />
        </label>

        <TitleMetadataSearch
          category={category}
          title={title}
          onApply={({ title: nextTitle, slice: appliedSlice }) => {
            if (nextTitle) setTitle(nextTitle);
            setSlice((prev) => mergeCategoryFormSlice(prev, appliedSlice));
          }}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-kurator-muted">Category fields</p>
          <CategoryMetadataFields
            category={category}
            values={slice}
            onChange={setSlice}
            hideManualCoverAndSerial
            richDescriptionNotes
          />
        </div>

        {message && (
          <p className="text-sm text-red-400" role="alert">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Create & add to hitlist"}
        </button>
      </form>
    </WishlistAddEntryModal>
  );
}
