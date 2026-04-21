"use client";

import { CoverArtField } from "@/components/CoverArtField";
import type { Category } from "@/lib/api";

export type CategoryFormSlice = {
  artist?: string;
  format?: string;
  /** When format is "other", the user-visible custom format (stored as `format` in metadata). */
  format_custom?: string;
  album?: string;
  genre?: string;
  year?: string;
  platform?: string;
  serial_number?: string;
  /** Video: series | movie */
  video_type?: string;
  /** Cover image URL (file upload or import-to-S3) */
  cover_art?: string;
  /** Book, manga, comic book */
  publisher?: string;
  /** Book, manga */
  author?: string;
  /** Book, manga */
  isbn?: string;
  /** Comic book */
  writer?: string;
  /** Comic book: true = single issue, false = TPB / collected edition */
  single_issue?: boolean;
  /** Comic book: issue # (when single issue) */
  issue_number?: string;
  /** Free-form notes stored as `metadata.notes` (multiline). */
  notes?: string;
  /** External catalog IDs for synopsis/plot enrichment (set from catalog search). */
  catalog_tmdb_id?: string;
  catalog_tmdb_media_type?: string;
  catalog_gamesdb_id?: string;
  catalog_mal_id?: string;
  catalog_google_books_id?: string;
  catalog_open_library_key?: string;
  catalog_comicvine_id?: string;
  catalog_comicvine_resource?: string;
};

type Props = {
  category: Category;
  values: CategoryFormSlice;
  onChange: (next: CategoryFormSlice) => void;
};

function ItemNotesField({
  values,
  onChange,
}: {
  values: CategoryFormSlice;
  onChange: (next: CategoryFormSlice) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-kurator-muted">Notes</span>
      <textarea
        rows={4}
        className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
        value={values.notes ?? ""}
        onChange={(e) => onChange({ ...values, notes: e.target.value })}
        placeholder="Optional: condition, edition, story arc, or other details"
        spellCheck={true}
      />
    </label>
  );
}

export function CategoryMetadataFields({ category, values, onChange }: Props) {
  if (category === "music") {
    return (
      <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-kurator-muted">Artist</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.artist ?? ""}
            onChange={(e) => onChange({ ...values, artist: e.target.value })}
            placeholder="e.g. Kraftwerk"
            autoComplete="off"
          />
        </label>
        <div className="block text-sm">
          <span className="text-kurator-muted">Format</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.format ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              onChange({
                ...values,
                format: next,
                format_custom: next === "other" ? values.format_custom : "",
              });
            }}
          >
            <option value="">Select…</option>
            <option value="vinyl">Vinyl</option>
            <option value="cd">CD</option>
            <option value="tape">Tape</option>
            <optgroup label="Other">
              <option value="other">Other…</option>
            </optgroup>
          </select>
          {values.format === "other" && (
            <label className="mt-3 block">
              <span className="text-kurator-muted">Custom format</span>
              <input
                className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                value={values.format_custom ?? ""}
                onChange={(e) => onChange({ ...values, format_custom: e.target.value })}
                placeholder="e.g. MiniDisc, SACD, reel-to-reel"
                autoComplete="off"
              />
            </label>
          )}
        </div>
        <label className="block text-sm">
          <span className="text-kurator-muted">Album</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.album ?? ""}
            onChange={(e) => onChange({ ...values, album: e.target.value })}
            placeholder="e.g. Autobahn"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Genre</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.genre ?? ""}
            onChange={(e) => onChange({ ...values, genre: e.target.value })}
            placeholder="e.g. Electronic"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Year</span>
          <input
            type="number"
            min={1000}
            max={9999}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            value={values.year ?? ""}
            onChange={(e) => onChange({ ...values, year: e.target.value })}
            placeholder="e.g. 1974"
            autoComplete="off"
          />
        </label>
        <div className="sm:col-span-2">
          <CoverArtField
            value={values.cover_art ?? ""}
            onChange={(u) => onChange({ ...values, cover_art: u })}
          />
        </div>
      </div>
      <ItemNotesField values={values} onChange={onChange} />
      </div>
    );
  }

  if (category === "movies" || category === "tv" || category === "anime") {
    return (
      <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-kurator-muted">Format</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.format ?? ""}
            onChange={(e) => onChange({ ...values, format: e.target.value })}
          >
            <option value="">Select…</option>
            <option value="vhs">VHS</option>
            <option value="dvd">DVD</option>
            <option value="blu_ray">Blu-Ray</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Type</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.video_type ?? ""}
            onChange={(e) => onChange({ ...values, video_type: e.target.value })}
          >
            <option value="">Select…</option>
            <option value="series">Series</option>
            <option value="movie">Movie</option>
            <option value="anime">Anime</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Genre</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.genre ?? ""}
            onChange={(e) => onChange({ ...values, genre: e.target.value })}
            placeholder="e.g. Sci-fi"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Year</span>
          <input
            type="number"
            min={1000}
            max={9999}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            value={values.year ?? ""}
            onChange={(e) => onChange({ ...values, year: e.target.value })}
            placeholder="e.g. 1999"
            autoComplete="off"
          />
        </label>
        <div className="sm:col-span-2">
          <CoverArtField
            value={values.cover_art ?? ""}
            onChange={(u) => onChange({ ...values, cover_art: u })}
          />
        </div>
      </div>
      <ItemNotesField values={values} onChange={onChange} />
      </div>
    );
  }

  if (category === "game") {
    return (
      <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-kurator-muted">Platform</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.platform ?? ""}
            onChange={(e) => onChange({ ...values, platform: e.target.value })}
            placeholder="e.g. SNES, PS5"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Year</span>
          <input
            type="number"
            min={1000}
            max={9999}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            value={values.year ?? ""}
            onChange={(e) => onChange({ ...values, year: e.target.value })}
            placeholder="e.g. 1998"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-kurator-muted">Serial number</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.serial_number ?? ""}
            onChange={(e) => onChange({ ...values, serial_number: e.target.value })}
            placeholder="Cart / disc serial"
            autoComplete="off"
          />
        </label>
        <div className="sm:col-span-2">
          <CoverArtField
            value={values.cover_art ?? ""}
            onChange={(u) => onChange({ ...values, cover_art: u })}
          />
        </div>
      </div>
      <ItemNotesField values={values} onChange={onChange} />
      </div>
    );
  }

  if (category === "book" || category === "manga") {
    return (
      <div className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-kurator-muted">Author</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={values.author ?? ""}
              onChange={(e) => onChange({ ...values, author: e.target.value })}
              placeholder="e.g. Ursula K. Le Guin"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Publisher</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={values.publisher ?? ""}
              onChange={(e) => onChange({ ...values, publisher: e.target.value })}
              placeholder="e.g. HarperCollins"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Year</span>
            <input
              type="number"
              inputMode="numeric"
              min={1000}
              max={9999}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={values.year ?? ""}
              onChange={(e) => onChange({ ...values, year: e.target.value })}
              placeholder="e.g. 1998"
              autoComplete="off"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-kurator-muted">ISBN</span>
          <input
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={values.isbn ?? ""}
            onChange={(e) => onChange({ ...values, isbn: e.target.value })}
            placeholder="978-0-385-50422-5"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <CoverArtField
          value={values.cover_art ?? ""}
          onChange={(u) => onChange({ ...values, cover_art: u })}
        />
        <ItemNotesField values={values} onChange={onChange} />
      </div>
    );
  }

  if (category === "comic_book") {
    return (
      <div className="space-y-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-kurator-muted">
          <input
            type="checkbox"
            className="mt-1 rounded-sm border-kurator-border bg-kurator-bg text-kurator-accent focus:ring-kurator-accent"
            checked={values.single_issue === true}
            onChange={(e) =>
              onChange({
                ...values,
                single_issue: e.target.checked,
                issue_number: e.target.checked ? values.issue_number : "",
              })
            }
          />
          <span>
            Single issue{" "}
            <span className="text-kurator-muted/80">(uncheck for a trade paperback or collected edition)</span>
          </span>
        </label>
        {values.single_issue === true && (
          <label className="block text-sm">
            <span className="text-kurator-muted">Issue #</span>
            <input
              className="mt-1 w-full max-w-xs rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={values.issue_number ?? ""}
              onChange={(e) => onChange({ ...values, issue_number: e.target.value })}
              placeholder="e.g. 1, 12, Annual 1"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-kurator-muted">Writer</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={values.writer ?? ""}
              onChange={(e) => onChange({ ...values, writer: e.target.value })}
              placeholder="e.g. Alan Moore"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Artist</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={values.artist ?? ""}
              onChange={(e) => onChange({ ...values, artist: e.target.value })}
              placeholder="e.g. Dave Gibbons"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Publisher</span>
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={values.publisher ?? ""}
              onChange={(e) => onChange({ ...values, publisher: e.target.value })}
              placeholder="e.g. DC Comics"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Year</span>
            <input
              type="number"
              inputMode="numeric"
              min={1000}
              max={9999}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={values.year ?? ""}
              onChange={(e) => onChange({ ...values, year: e.target.value })}
              placeholder="e.g. 1987"
              autoComplete="off"
            />
          </label>
        </div>
        <CoverArtField
          value={values.cover_art ?? ""}
          onChange={(u) => onChange({ ...values, cover_art: u })}
        />
        <ItemNotesField values={values} onChange={onChange} />
      </div>
    );
  }

  return null;
}
