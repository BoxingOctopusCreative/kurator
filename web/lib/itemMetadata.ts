import type { CategoryFormSlice } from "@/components/CategoryMetadataFields";
import type { Category } from "@/lib/api";
import {
  assertLooseMultilineText,
  assertOptionalHttpUrl,
  assertStrictPlainText,
  LIMITS,
  optionalStrictPlain,
  ValidationError,
} from "@/lib/validation";

const MUSIC_FORMAT = new Set(["vinyl", "cd", "tape", "other"]);
const VIDEO_FORMAT = new Set(["vhs", "dvd", "blu_ray"]);
const VIDEO_TYPE = new Set(["series", "movie", "anime"]);

function yearFromString(s: string | undefined, field: string): number | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  if (!/^\d{4}$/.test(t)) {
    throw new ValidationError(`${field} must be a 4-digit year.`);
  }
  const y = parseInt(t, 10);
  if (y < 1000 || y > 9999) {
    throw new ValidationError(`${field} must be between 1000 and 9999.`);
  }
  return y;
}

/**
 * Merges category-specific form fields and optional notes into metadata for the API.
 * @throws ValidationError on unsafe or invalid input
 */
export function buildItemMetadata(category: Category, slice: CategoryFormSlice): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (category === "music") {
    const artist = optionalStrictPlain(slice.artist, LIMITS.shortText, "Artist");
    if (artist) out.artist = artist;

    const fmt = slice.format?.trim();
    if (fmt) {
      if (!MUSIC_FORMAT.has(fmt)) {
        throw new ValidationError("Invalid music format.");
      }
      if (fmt === "other") {
        const custom = slice.format_custom?.trim();
        if (custom) {
          out.format = assertStrictPlainText(custom, LIMITS.shortText, "Custom format");
        }
      } else {
        out.format = fmt;
      }
    }

    const album = optionalStrictPlain(slice.album, LIMITS.shortText, "Album");
    if (album) out.album = album;
    const genre = optionalStrictPlain(slice.genre, LIMITS.shortText, "Genre");
    if (genre) out.genre = genre;
    const y = yearFromString(slice.year, "Year");
    if (y !== undefined) out.year = y;
  }

  if (category === "game") {
    const platform = optionalStrictPlain(slice.platform, LIMITS.shortText, "Platform");
    if (platform) out.platform = platform;
    const serial = optionalStrictPlain(slice.serial_number, LIMITS.shortText, "Serial number");
    if (serial) out.serial_number = serial;
    const gy = yearFromString(slice.year, "Year");
    if (gy !== undefined) out.year = gy;
    const cgid = optionalStrictPlain(slice.catalog_gamesdb_id, LIMITS.dbIdentifier, "Catalog (TheGamesDB)");
    if (cgid) out.catalog_gamesdb_id = cgid;
  }

  if (category === "movies" || category === "tv" || category === "anime") {
    const vf = slice.format?.trim();
    if (vf) {
      if (!VIDEO_FORMAT.has(vf)) {
        throw new ValidationError("Invalid video format.");
      }
      out.format = vf;
    }
    const vt = slice.video_type?.trim();
    if (vt) {
      if (!VIDEO_TYPE.has(vt)) {
        throw new ValidationError("Invalid video type.");
      }
      out.video_type = vt;
    }
    const genre = optionalStrictPlain(slice.genre, LIMITS.shortText, "Genre");
    if (genre) out.genre = genre;
    const vy = yearFromString(slice.year, "Year");
    if (vy !== undefined) out.year = vy;
    const tid = optionalStrictPlain(slice.catalog_tmdb_id, LIMITS.dbIdentifier, "Catalog (TMDB id)");
    if (tid) out.catalog_tmdb_id = tid;
    const tmt = slice.catalog_tmdb_media_type?.trim();
    if (tmt) {
      if (tmt !== "movie" && tmt !== "tv") {
        throw new ValidationError("Catalog TMDB media type must be movie or tv.");
      }
      out.catalog_tmdb_media_type = tmt;
    }
  }

  if (category === "book" || category === "manga") {
    const author = optionalStrictPlain(slice.author, LIMITS.shortText, "Author");
    if (author) out.author = author;
    const publisher = optionalStrictPlain(slice.publisher, LIMITS.shortText, "Publisher");
    if (publisher) out.publisher = publisher;
    const by = yearFromString(slice.year, "Year");
    if (by !== undefined) out.year = by;
    const isbn = optionalStrictPlain(slice.isbn, 32, "ISBN");
    if (isbn) out.isbn = isbn;
    const gb = optionalStrictPlain(slice.catalog_google_books_id, LIMITS.dbIdentifier, "Catalog (Google Books)");
    if (gb) out.catalog_google_books_id = gb;
    const olk = optionalStrictPlain(slice.catalog_open_library_key, LIMITS.metadataString, "Catalog (Open Library)");
    if (olk) out.catalog_open_library_key = olk;
  }

  if (category === "manga") {
    const mal = optionalStrictPlain(slice.catalog_mal_id, LIMITS.dbIdentifier, "Catalog (MyAnimeList)");
    if (mal) out.catalog_mal_id = mal;
  }

  if (category === "comic_book") {
    const writer = optionalStrictPlain(slice.writer, LIMITS.shortText, "Writer");
    if (writer) out.writer = writer;
    const comicArtist = optionalStrictPlain(slice.artist, LIMITS.shortText, "Artist");
    if (comicArtist) out.artist = comicArtist;
    const publisher = optionalStrictPlain(slice.publisher, LIMITS.shortText, "Publisher");
    if (publisher) out.publisher = publisher;
    const cy = yearFromString(slice.year, "Year");
    if (cy !== undefined) out.year = cy;
    if (slice.single_issue === true) {
      out.single_issue = true;
    } else if (slice.single_issue === false) {
      out.single_issue = false;
    }
    const issueNum = optionalStrictPlain(slice.issue_number, 64, "Issue #");
    if (issueNum) out.issue_number = issueNum;
    const cvid = optionalStrictPlain(slice.catalog_comicvine_id, LIMITS.dbIdentifier, "Catalog (Comic Vine id)");
    if (cvid) out.catalog_comicvine_id = cvid;
    const cvr = slice.catalog_comicvine_resource?.trim();
    if (cvr) {
      if (cvr !== "issue" && cvr !== "volume") {
        throw new ValidationError("Comic Vine resource must be issue or volume.");
      }
      out.catalog_comicvine_resource = cvr;
    }
    const gb = optionalStrictPlain(slice.catalog_google_books_id, LIMITS.dbIdentifier, "Catalog (Google Books)");
    if (gb) out.catalog_google_books_id = gb;
    const olk = optionalStrictPlain(slice.catalog_open_library_key, LIMITS.metadataString, "Catalog (Open Library)");
    if (olk) out.catalog_open_library_key = olk;
  }

  const cover = slice.cover_art?.trim();
  if (cover) {
    out.cover_art = assertOptionalHttpUrl(cover, "Cover art URL");
  }

  const notes = assertLooseMultilineText(slice.notes ?? "", LIMITS.description, "Notes", { allowEmpty: true });
  if (notes) {
    out.notes = notes;
  }

  return out;
}

function metaPlainString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function metaYearString(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    const s = String(Math.trunc(v));
    return /^\d{4}$/.test(s) ? s : undefined;
  }
  if (typeof v === "string" && /^\d{4}$/.test(v.trim())) return v.trim();
  return undefined;
}

/**
 * Best-effort inverse of {@link buildItemMetadata} for editing: maps stored metadata into form slice fields.
 */
export function metadataToCategoryFormSlice(category: Category, metadata: unknown): CategoryFormSlice {
  const m =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const slice: CategoryFormSlice = {};

  const cover = metaPlainString(m.cover_art);
  if (cover) slice.cover_art = cover;
  const notes = metaPlainString(m.notes);
  if (notes) slice.notes = notes;

  const y = metaYearString(m.year);
  if (y) slice.year = y;

  if (category === "music") {
    const artist = metaPlainString(m.artist);
    if (artist) slice.artist = artist;
    const album = metaPlainString(m.album);
    if (album) slice.album = album;
    const genre = metaPlainString(m.genre);
    if (genre) slice.genre = genre;
    const fmt = metaPlainString(m.format);
    if (fmt) {
      if (MUSIC_FORMAT.has(fmt)) {
        slice.format = fmt;
      } else {
        slice.format = "other";
        slice.format_custom = fmt;
      }
    }
  }

  if (category === "game") {
    const platform = metaPlainString(m.platform);
    if (platform) slice.platform = platform;
    const serial = metaPlainString(m.serial_number);
    if (serial) slice.serial_number = serial;
    const cgid = metaPlainString(m.catalog_gamesdb_id);
    if (cgid) slice.catalog_gamesdb_id = cgid;
  }

  if (category === "movies" || category === "tv" || category === "anime") {
    const vf = metaPlainString(m.format);
    if (vf && VIDEO_FORMAT.has(vf)) slice.format = vf;
    const vt = metaPlainString(m.video_type);
    if (vt && VIDEO_TYPE.has(vt)) slice.video_type = vt;
    const genre = metaPlainString(m.genre);
    if (genre) slice.genre = genre;
    const tid = metaPlainString(m.catalog_tmdb_id);
    if (tid) slice.catalog_tmdb_id = tid;
    const tmt = metaPlainString(m.catalog_tmdb_media_type);
    if (tmt === "movie" || tmt === "tv") slice.catalog_tmdb_media_type = tmt;
  }

  if (category === "book" || category === "manga") {
    const author = metaPlainString(m.author);
    if (author) slice.author = author;
    const publisher = metaPlainString(m.publisher);
    if (publisher) slice.publisher = publisher;
    const isbn = metaPlainString(m.isbn);
    if (isbn) slice.isbn = isbn;
    const gb = metaPlainString(m.catalog_google_books_id);
    if (gb) slice.catalog_google_books_id = gb;
    const olk = metaPlainString(m.catalog_open_library_key);
    if (olk) slice.catalog_open_library_key = olk;
  }

  if (category === "manga") {
    const mal = metaPlainString(m.catalog_mal_id);
    if (mal) slice.catalog_mal_id = mal;
  }

  if (category === "comic_book") {
    const writer = metaPlainString(m.writer);
    if (writer) slice.writer = writer;
    const comicArtist = metaPlainString(m.artist);
    if (comicArtist) slice.artist = comicArtist;
    const publisher = metaPlainString(m.publisher);
    if (publisher) slice.publisher = publisher;
    const issueNum = metaPlainString(m.issue_number);
    if (issueNum) slice.issue_number = issueNum;
    if (typeof m.single_issue === "boolean") {
      slice.single_issue = m.single_issue;
    }
    const cvid = metaPlainString(m.catalog_comicvine_id);
    if (cvid) slice.catalog_comicvine_id = cvid;
    const cvr = metaPlainString(m.catalog_comicvine_resource);
    if (cvr === "issue" || cvr === "volume") slice.catalog_comicvine_resource = cvr;
    const gb = metaPlainString(m.catalog_google_books_id);
    if (gb) slice.catalog_google_books_id = gb;
    const olk = metaPlainString(m.catalog_open_library_key);
    if (olk) slice.catalog_open_library_key = olk;
  }

  return slice;
}
