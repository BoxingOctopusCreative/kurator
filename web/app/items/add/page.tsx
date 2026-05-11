"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CategoryMetadataFields,
  type CategoryFormSlice,
} from "@/components/CategoryMetadataFields";
import { TitleMetadataSearch } from "@/components/TitleMetadataSearch";
import { ItemStarRating } from "@/components/ItemStarRating";
import { createItem, fetchCollections, type Category, type Collection, type ConsumptionStatus } from "@/lib/api";
import { consumptionDoneLabel, consumptionPendingLabel } from "@/lib/consumptionLabels";
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

export default function AddItemPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionParam = searchParams.get("collection");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("game");
  const [slice, setSlice] = useState<CategoryFormSlice>({});
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [consumption, setConsumption] = useState<ConsumptionStatus>("pending");

  useEffect(() => {
    let cancelled = false;
    fetchCollections({ limit: 100, sort: "name_asc" })
      .then((res) => {
        if (cancelled) return;
        setAllCollections(res.items);
      })
      .catch(() => {
        if (!cancelled) setAllCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleCollections = useMemo(
    () => allCollections.filter((c) => !c.category || c.category === category),
    [allCollections, category]
  );

  useEffect(() => {
    const fromUrl =
      collectionParam?.trim() &&
      visibleCollections.some((c) => c.id === collectionParam.trim())
        ? collectionParam.trim()
        : null;
    setCollectionId((prev) => {
      if (visibleCollections.length === 0) return null;
      if (fromUrl) return fromUrl;
      if (prev != null && visibleCollections.some((c) => c.id === prev)) return prev;
      return visibleCollections[0].id;
    });
  }, [visibleCollections, collectionParam]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setStatus("saving");
    try {
      if (collectionId == null || collectionId.trim() === "") {
        setMessage("Choose a collection.");
        setStatus("idle");
        return;
      }
      const safeTitle = assertItemTitle(title);
      const metadata = buildItemMetadata(category, slice);
      const cid = collectionId.trim();
      await createItem({
        title: safeTitle,
        category,
        collection_id: cid,
        metadata,
        rating: rating ?? undefined,
        consumption_status: consumption,
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold text-kurator-fg">Add Item</h1>
      <p className="mt-1 text-sm text-kurator-muted">
        Add a title, pick a type, and fill in what you know.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
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
          <span className="mt-1 block text-xs text-kurator-muted">
            Shelves pinned to another type are hidden from this picker.
          </span>
        </label>

        <label className="block text-sm">
          <span className="text-kurator-muted">Collection</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={collectionId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setCollectionId(v === "" ? null : v);
            }}
            disabled={visibleCollections.length === 0}
            required
          >
            {allCollections.length === 0 ? (
              <option value="">Loading collections…</option>
            ) : visibleCollections.length === 0 ? (
              <option value="">No shelf for this category — create one on Collections</option>
            ) : (
              visibleCollections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.category ? " (any type)" : ""}
                </option>
              ))
            )}
          </select>
          <span className="mt-1 block text-xs text-kurator-muted">
            Items are saved to this shelf. Create more collections on the Collections page.
          </span>
        </label>

        <label className="block text-sm">
          <span className="text-kurator-muted">Title</span>
          <input
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
          onApply={({ title: nextTitle, slice }) => {
            if (nextTitle) setTitle(nextTitle);
            setSlice((prev) => mergeCategoryFormSlice(prev, slice));
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
            <option value="pending">{consumptionPendingLabel(category)}</option>
            <option value="done">{consumptionDoneLabel(category)}</option>
          </select>
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-kurator-muted">Category fields</p>
          <CategoryMetadataFields category={category} values={slice} onChange={setSlice} />
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
    </div>
  );
}
