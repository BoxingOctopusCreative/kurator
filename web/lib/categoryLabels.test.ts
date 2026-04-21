import { describe, expect, it } from "vitest";
import { categoryLabel } from "./categoryLabels";

describe("categoryLabel", () => {
  it("maps known categories", () => {
    expect(categoryLabel("game")).toBe("Game");
    expect(categoryLabel("music")).toBe("Music");
    expect(categoryLabel("book")).toBe("Book");
    expect(categoryLabel("movies")).toBe("Movies");
    expect(categoryLabel("tv")).toBe("TV");
    expect(categoryLabel("anime")).toBe("Anime");
    expect(categoryLabel("comic_book")).toBe("Comic book");
    expect(categoryLabel("manga")).toBe("Manga");
  });

  it("returns raw value for unknown keys", () => {
    expect(categoryLabel("future_type")).toBe("future_type");
  });
});
