import type { Category, ConsumptionStatus } from "./api";

/** Treat missing field (older API) as still queued. */
export function normalizeConsumptionStatus(item: { consumption_status?: ConsumptionStatus }): ConsumptionStatus {
  return item.consumption_status ?? "pending";
}

export function consumptionPendingLabel(category: Category): string {
  switch (category) {
    case "book":
    case "comic_book":
    case "manga":
      return "To read";
    case "movies":
    case "tv":
    case "anime":
      return "To watch";
    case "music":
      return "Not listened yet";
    case "game":
      return "Unplayed";
    default:
      return "Not finished";
  }
}

export function consumptionDoneLabel(category: Category): string {
  switch (category) {
    case "book":
    case "comic_book":
    case "manga":
      return "Read";
    case "movies":
    case "tv":
    case "anime":
      return "Watched";
    case "music":
      return "Listened";
    case "game":
      return "Played";
    default:
      return "Finished";
  }
}

export function consumptionBadgeText(category: Category, status: ConsumptionStatus): string {
  return status === "done" ? consumptionDoneLabel(category) : consumptionPendingLabel(category);
}
