import { describe, expect, it } from "vitest";
import {
  consumptionBadgeText,
  consumptionDoneLabel,
  consumptionPendingLabel,
  normalizeConsumptionStatus,
} from "./consumptionLabels";

describe("consumptionLabels", () => {
  it("normalizes missing status to pending", () => {
    expect(normalizeConsumptionStatus({})).toBe("pending");
    expect(normalizeConsumptionStatus({ consumption_status: "done" })).toBe("done");
  });

  it("uses category-specific wording", () => {
    expect(consumptionPendingLabel("book")).toBe("To read");
    expect(consumptionDoneLabel("book")).toBe("Read");
    expect(consumptionPendingLabel("movies")).toBe("To watch");
    expect(consumptionDoneLabel("tv")).toBe("Watched");
    expect(consumptionPendingLabel("music")).toBe("Not listened yet");
    expect(consumptionDoneLabel("music")).toBe("Listened");
    expect(consumptionPendingLabel("game")).toBe("Unplayed");
    expect(consumptionDoneLabel("game")).toBe("Played");
    expect(consumptionBadgeText("manga", "pending")).toBe("To read");
    expect(consumptionBadgeText("manga", "done")).toBe("Read");
  });
});
