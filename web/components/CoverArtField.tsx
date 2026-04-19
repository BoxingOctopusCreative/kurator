"use client";

import { useId, useState } from "react";
import { importCoverImageFromUrl, uploadCoverImage } from "@/lib/api";
import { assertHttpOrHttpsUrl } from "@/lib/validation";

type Props = {
  value: string;
  onChange: (url: string) => void;
};

export function CoverArtField({ value, onChange }: Props) {
  const id = useId();
  const fileInputId = `${id}-file`;
  const [importUrl, setImportUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setError(file ? "Choose an image file (JPEG, PNG, GIF, or WebP)." : null);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const url = await uploadCoverImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onImportFromRemote() {
    const u = importUrl.trim();
    if (!u) {
      setError("Enter an image URL.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const safe = assertHttpOrHttpsUrl(u, "Image URL");
      const url = await importCoverImageFromUrl(safe);
      onChange(url);
      setImportUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-kurator-border bg-kurator-bg/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-kurator-muted">Cover art</span>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-16 w-16 rounded-md border border-kurator-border object-cover"
          />
        ) : (
          <span className="text-xs text-kurator-muted/80">No image</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input id={fileInputId} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={onPickFile} disabled={busy} />
        <label
          htmlFor={fileInputId}
          className="inline-flex cursor-pointer rounded-lg border border-kurator-border bg-kurator-bg px-3 py-1.5 text-xs font-medium text-kurator-fg hover:bg-kurator-surface disabled:opacity-50"
        >
          {busy ? "…" : "Upload file"}
        </label>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 text-sm">
          <span className="text-kurator-muted">Import from URL</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://…"
            disabled={busy}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onImportFromRemote()}
          className="shrink-0 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-xs font-medium text-kurator-fg hover:bg-kurator-surface disabled:opacity-50"
        >
          Import
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
