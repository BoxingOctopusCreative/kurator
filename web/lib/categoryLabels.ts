/** Human-readable label for an item category value from the API. */
export function categoryLabel(c: string): string {
  switch (c) {
    case "game":
      return "Game";
    case "music":
      return "Music";
    case "book":
      return "Book";
    case "movies":
      return "Movies";
    case "tv":
      return "TV";
    case "anime":
      return "Anime";
    case "comic_book":
      return "Comic book";
    case "manga":
      return "Manga";
    default:
      return c;
  }
}
