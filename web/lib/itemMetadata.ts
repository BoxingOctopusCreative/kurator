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
const VIDEO_TYPE = new Set(["series", "movie"]);

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

  if (category === "video") {
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
