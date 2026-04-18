import { describe, expect, it } from "vitest";
import type { CategoryFormSlice } from "@/components/CategoryMetadataFields";
import { buildItemMetadata } from "./itemMetadata";
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

  it("builds video fields", () => {
    const slice: CategoryFormSlice = {
      format: "dvd",
      video_type: "movie",
      genre: "Sci-fi",
      year: "1999",
      cover_art: "https://example/p.jpg",
    };
    expect(buildItemMetadata("video", slice)).toMatchObject({
      format: "dvd",
      video_type: "movie",
      genre: "Sci-fi",
      year: 1999,
      cover_art: "https://example/p.jpg",
    });
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
