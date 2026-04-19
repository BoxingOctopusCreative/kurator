"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CategoryMetadataFields,
  type CategoryFormSlice,
} from "@/components/CategoryMetadataFields";
import { TitleMetadataSearch } from "@/components/TitleMetadataSearch";
import { createItem, fetchCollections, type Category } from "@/lib/api";
import { buildItemMetadata } from "@/lib/itemMetadata";
import { mergeCategoryFormSlice } from "@/lib/mergeCategoryFormSlice";
import { assertItemTitle } from "@/lib/validation";

const categories: { value: Category; label: string }[] = [
  { value: "game", label: "Game" },
  { value: "music", label: "Music" },
  { value: "book", label: "Book" },
  { value: "video", label: "Video" },
  { value: "comic_book", label: "Comic book" },
  { value: "manga", label: "Manga" },
];

export default function AddItemPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("game");
  const [slice, setSlice] = useState<CategoryFormSlice>({});
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [collections, setCollections] = useState<{ id: number; name: string }[]>([]);
  const [collectionId, setCollectionId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCollections({ limit: 100, sort: "name_asc" })
      .then((res) => {
        if (cancelled) return;
        const items = res.items.map((c) => ({ id: c.id, name: c.name }));
        setCollections(items);
        setCollectionId((prev) => {
          if (prev != null) return prev;
          if (items.length > 0) return items[0].id;
          return 1;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCollectionId((prev) => (prev != null ? prev : 1));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setStatus("saving");
    try {
      if (collectionId == null || collectionId < 1) {
        setMessage("Choose a collection.");
        setStatus("idle");
        return;
      }
      const safeTitle = assertItemTitle(title);
      const metadata = buildItemMetadata(category, slice);
      const cid = collectionId;
      await createItem({ title: safeTitle, category, collection_id: cid, metadata });
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
      <h1 className="text-2xl font-semibold text-kurator-fg">Add item</h1>
      <p className="mt-1 text-sm text-kurator-muted">
        Add a title, pick a type, and fill in what you know.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        <label className="block text-sm">
          <span className="text-kurator-muted">Collection</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={collectionId ?? ""}
            onChange={(e) => setCollectionId(Number(e.target.value))}
            disabled={collections.length === 0}
            required
          >
            {collections.length === 0 ? (
              <option value="">Loading collections…</option>
            ) : (
              collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
          {status === "saving" ? "Saving…" : "Save item"}
        </button>
      </form>
    </div>
  );
}
