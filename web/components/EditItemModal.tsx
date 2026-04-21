"use client";

import { useEffect, useRef, useState } from "react";
import {
  CategoryMetadataFields,
  type CategoryFormSlice,
} from "@/components/CategoryMetadataFields";
import { ItemStarRating } from "@/components/ItemStarRating";
import { TitleMetadataSearch } from "@/components/TitleMetadataSearch";
import { WishlistAddEntryModal } from "@/components/WishlistAddEntryModal";
import { type Category, type ConsumptionStatus, type Item, updateItem } from "@/lib/api";
import { categoryLabel } from "@/lib/categoryLabels";
import { consumptionDoneLabel, consumptionPendingLabel, normalizeConsumptionStatus } from "@/lib/consumptionLabels";
import { buildItemMetadata, metadataToCategoryFormSlice } from "@/lib/itemMetadata";
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
  item: Item | null;
  /** When set, category matches a typed shelf and cannot be changed here. */
  collectionCategory: Category | null;
  onSaved: () => void | Promise<void>;
};

export function EditItemModal({
  open,
  onOpenChange,
  item,
  collectionCategory,
  onSaved,
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
    if (!open || !item) return;
    setTitle(item.title);
    setCategory(item.category);
    setSlice(metadataToCategoryFormSlice(item.category, item.metadata));
    setRating(item.rating ?? null);
    setConsumption(normalizeConsumptionStatus(item));
    setMessage(null);
    setStatus("idle");
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  }, [open, item]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setMessage(null);
    setStatus("saving");
    try {
      const safeTitle = assertItemTitle(title);
      const cat = categoryPinned ? collectionCategory! : category;
      const metadata = buildItemMetadata(cat, slice);
      await updateItem(item.id, {
        title: safeTitle,
        category: cat,
        metadata,
        rating: rating ?? null,
        consumption_status: consumption,
      });
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setStatus("idle");
    }
  }

  if (!open || !item) return null;

  return (
    <WishlistAddEntryModal open={open} onOpenChange={onOpenChange} title="Edit item">
      <form onSubmit={onSubmit} className="space-y-5">
        <p className="text-xs text-kurator-muted">
          Changes are saved to your library
          {categoryPinned ? ` (${categoryLabel(collectionCategory)})` : ""}.
        </p>

        {!categoryPinned ? (
          <label className="block text-sm">
            <span className="text-kurator-muted">Category</span>
            <select
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={category}
              onChange={(e) => {
                const next = e.target.value as Category;
                setCategory(next);
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
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </form>
    </WishlistAddEntryModal>
  );
}
