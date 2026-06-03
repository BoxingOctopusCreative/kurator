import { describe, expect, it } from "vitest";
import { shelfAuthorFromProfileUrl, toShelfAuthor } from "./shelfAuthor";

describe("toShelfAuthor", () => {
  it("normalizes public user fields", () => {
    expect(
      toShelfAuthor({
        username: "alice",
        display_name: "Alice",
        avatar_url: "https://cdn.example/a.jpg",
      }),
    ).toEqual({
      username: "alice",
      display_name: "Alice",
      avatar_url: "https://cdn.example/a.jpg",
    });
  });
});

describe("shelfAuthorFromProfileUrl", () => {
  it("parses /people/{username} paths", () => {
    expect(shelfAuthorFromProfileUrl("/people/cool%20cat", "Cool Cat")).toEqual({
      username: "cool cat",
      display_name: "Cool Cat",
      avatar_url: null,
    });
  });

  it("returns null for missing or invalid URLs", () => {
    expect(shelfAuthorFromProfileUrl(null, "X")).toBeNull();
    expect(shelfAuthorFromProfileUrl("/collections/1", "X")).toBeNull();
  });
});
