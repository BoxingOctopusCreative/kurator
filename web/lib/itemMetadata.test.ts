import { describe, expect, it } from "vitest";
import type { CategoryFormSlice } from "@/components/CategoryMetadataFields";
import { buildItemMetadata, metadataToCategoryFormSlice } from "./itemMetadata";
import { ValidationError } from "./validation";

describe("buildItemMetadata", () => {
  it("builds music fields and year as number", () => {
    const slice: CategoryFormSlice = {
      artist: "A",
      format: "vinyl",
      album: "L",
      genre: "G",
      year: "1974",
      cover_art: " https://x.example/c.png ",
    };
    const out = buildItemMetadata("music", slice);
    expect(out).toEqual({
      artist: "A",
      format: "vinyl",
      album: "L",
      genre: "G",
      year: 1974,
      cover_art: "https://x.example/c.png",
    });
  });

  it("rejects invalid year for music", () => {
    expect(() => buildItemMetadata("music", { year: "12" })).toThrow(ValidationError);
  });

  it("uses custom format text when format is Other", () => {
    expect(
      buildItemMetadata("music", { format: "other", format_custom: "  MiniDisc  " })
    ).toMatchObject({ format: "MiniDisc" });
  });

  it("omits format when Other is selected but custom is empty", () => {
    const out = buildItemMetadata("music", { format: "other", format_custom: "   " });
    expect(out).not.toHaveProperty("format");
  });

  it("builds movies / TMDB-style fields", () => {
    const slice: CategoryFormSlice = {
      format: "dvd",
      video_type: "movie",
      genre: "Sci-fi",
      year: "1999",
      cover_art: "https://example/p.jpg",
    };
    expect(buildItemMetadata("movies", slice)).toMatchObject({
      format: "dvd",
      video_type: "movie",
      genre: "Sci-fi",
      year: 1999,
      cover_art: "https://example/p.jpg",
    });
  });

  it("builds TV box set and single season metadata", () => {
    expect(
      buildItemMetadata("tv", {
        format: "blu_ray",
        video_type: "series",
        tv_edition: "box_set",
      }),
    ).toMatchObject({ format: "blu_ray", video_type: "series", tv_edition: "box_set" });
    expect(
      buildItemMetadata("tv", {
        format: "dvd",
        video_type: "series",
        tv_edition: "single_season",
        tv_season: " 4 ",
      }),
    ).toEqual({
      format: "dvd",
      video_type: "series",
      tv_edition: "single_season",
      tv_season: 4,
    });
  });

  it("requires season for TV single_season", () => {
    expect(() =>
      buildItemMetadata("tv", { tv_edition: "single_season", tv_season: "" }),
    ).toThrow(ValidationError);
  });

  it("includes notes; category fields take precedence over same key from notes slice only via category fields", () => {
    const out = buildItemMetadata("game", {
      platform: "SNES",
      notes: "CIB\nNear mint",
    });
    expect(out.platform).toBe("SNES");
    expect(out.notes).toBe("CIB\nNear mint");
  });

  it("builds game year as number", () => {
    expect(
      buildItemMetadata("game", { platform: "PlayStation 5", year: "2024", serial_number: "X" })
    ).toEqual({ platform: "PlayStation 5", year: 2024, serial_number: "X" });
  });

  it("builds book author, publisher, year, ISBN, and cover", () => {
    expect(
      buildItemMetadata("book", {
        author: " A ",
        publisher: " Pub ",
        year: "1999",
        isbn: " 978-0-385-50422-5 ",
        cover_art: "https://c.example/x.png",
      })
    ).toEqual({
      author: "A",
      publisher: "Pub",
      year: 1999,
      isbn: "978-0-385-50422-5",
      cover_art: "https://c.example/x.png",
    });
  });

  it("builds manga author, publisher, year, and ISBN", () => {
    expect(
      buildItemMetadata("manga", {
        author: "Mangaka",
        publisher: "Shueisha",
        year: "2020",
        isbn: "9781234567890",
      })
    ).toEqual({
      author: "Mangaka",
      publisher: "Shueisha",
      year: 2020,
      isbn: "9781234567890",
    });
  });

  it("builds comic book writer, artist, publisher, year, single-issue flags", () => {
    expect(
      buildItemMetadata("comic_book", {
        writer: "W",
        artist: "Art",
        publisher: "Pub",
        year: "1987",
        single_issue: true,
        issue_number: " 12 ",
      })
    ).toEqual({
      writer: "W",
      artist: "Art",
      publisher: "Pub",
      year: 1987,
      single_issue: true,
      issue_number: "12",
    });
    expect(
      buildItemMetadata("comic_book", { writer: "W", single_issue: false })
    ).toMatchObject({ writer: "W", single_issue: false });
  });
});

describe("metadataToCategoryFormSlice", () => {
  it("round-trips music including vinyl and custom format", () => {
    const built = buildItemMetadata("music", {
      artist: "A",
      format: "vinyl",
      album: "L",
      year: "1974",
    });
    const slice = metadataToCategoryFormSlice("music", built);
    expect(buildItemMetadata("music", slice)).toEqual(built);
    const customMeta = buildItemMetadata("music", { format: "other", format_custom: "MiniDisc" });
    const slice2 = metadataToCategoryFormSlice("music", customMeta);
    expect(buildItemMetadata("music", slice2)).toEqual(customMeta);
  });

  it("round-trips comic book single_issue and issue number", () => {
    const built = buildItemMetadata("comic_book", {
      writer: "W",
      artist: "Art",
      publisher: "Pub",
      year: "1987",
      single_issue: true,
      issue_number: "12",
    });
    const slice = metadataToCategoryFormSlice("comic_book", built);
    expect(buildItemMetadata("comic_book", slice)).toEqual(built);
  });

  it("round-trips TV edition and season", () => {
    const built = buildItemMetadata("tv", {
      format: "dvd",
      video_type: "series",
      year: "2010",
      tv_edition: "single_season",
      tv_season: "2",
    });
    const slice = metadataToCategoryFormSlice("tv", built);
    expect(buildItemMetadata("tv", slice)).toEqual(built);
  });
});
