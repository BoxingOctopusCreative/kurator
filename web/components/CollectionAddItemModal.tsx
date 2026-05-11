"use client";

import { useEffect, useRef, useState } from "react";
import {
  CategoryMetadataFields,
  type CategoryFormSlice,
} from "@/components/CategoryMetadataFields";
import { ItemStarRating } from "@/components/ItemStarRating";
import { TitleMetadataSearch } from "@/components/TitleMetadataSearch";
import { WishlistAddEntryModal } from "@/components/WishlistAddEntryModal";
import { createItem, type Category, type ConsumptionStatus } from "@/lib/api";
import { consumptionDoneLabel, consumptionPendingLabel } from "@/lib/consumptionLabels";
import { categoryLabel } from "@/lib/categoryLabels";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  /** When set, item category is fixed for this shelf. */
  collectionCategory: Category | null;
  onCreated: () => void | Promise<void>;
};

export function CollectionAddItemModal({
  open,
  onOpenChange,
  collectionId,
  collectionCategory,
  onCreated,
}: Props) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("game");
  const [slice, setSlice] = useState<CategoryFormSlice>({});
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [consumption, setConsumption] = useState<ConsumptionStatus>("pending");

  const categoryPinned = collectionCategory != null;

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSlice({});
    setRating(null);
    setConsumption("pending");
    setMessage(null);
    setStatus("idle");
    setCategory(collectionCategory ?? "game");
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  }, [open, collectionCategory]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setStatus("saving");
    try {
      const safeTitle = assertItemTitle(title);
      const cat = categoryPinned ? collectionCategory! : category;
      const metadata = buildItemMetadata(cat, slice);
      await createItem({
        title: safeTitle,
        category: cat,
        collection_id: collectionId,
        metadata,
        rating: rating ?? undefined,
        consumption_status: consumption,
      });
      await onCreated();
      onOpenChange(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <WishlistAddEntryModal open={open} onOpenChange={onOpenChange} title="Add Item">
      <form onSubmit={onSubmit} className="space-y-5">
        <p className="text-xs text-kurator-muted">
          New items are saved to this shelf
          {categoryPinned ? ` (${categoryLabel(collectionCategory)})` : ""}.
        </p>

        {!categoryPinned ? (
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
        ) : (
          <p className="text-sm text-kurator-muted">
            Type: <span className="font-medium text-kurator-fg">{categoryLabel(collectionCategory)}</span>
          </p>
        )}

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
          category={categoryPinned ? collectionCategory! : category}
          title={title}
          onApply={({ title: nextTitle, slice: appliedSlice }) => {
            if (nextTitle) setTitle(nextTitle);
            setSlice((prev) => mergeCategoryFormSlice(prev, appliedSlice));
          }}
        />

        <div className="space-y-2">
          <span className="block text-sm text-kurator-muted">Rating (optional)</span>
          <ItemStarRating value={rating} onChange={setRating} />
        </div>

        <label className="block text-sm">
          <span className="text-kurator-muted">Status</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={consumption}
            onChange={(e) => setConsumption(e.target.value as ConsumptionStatus)}
          >
            <option value="pending">
              {consumptionPendingLabel(categoryPinned ? collectionCategory! : category)}
            </option>
            <option value="done">
              {consumptionDoneLabel(categoryPinned ? collectionCategory! : category)}
            </option>
          </select>
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-kurator-muted">Category fields</p>
          <CategoryMetadataFields
            category={categoryPinned ? collectionCategory! : category}
            values={slice}
            onChange={setSlice}
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
          {status === "saving" ? "Saving…" : "Save Item"}
        </button>
      </form>
    </WishlistAddEntryModal>
  );
}
