/** Human-readable label for an item category value from the API. */
export function categoryLabel(c: string): string {
  switch (c) {
    case "game":
      return "Game";
    case "music":
      return "Music";
    case "book":
      return "Book";
    case "video":
      return "Video";
    case "comic_book":
      return "Comic book";
    case "manga":
      return "Manga";
    default:
      return c;
  }
}
