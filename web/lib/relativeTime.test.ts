import { describe, expect, it } from "vitest";
import { formatRelativeTimeShort } from "./relativeTime";

const now = new Date("2026-06-01T12:00:00.000Z");

describe("formatRelativeTimeShort", () => {
  it("uses seconds under one minute", () => {
    expect(formatRelativeTimeShort("2026-06-01T11:59:45.000Z", now)).toBe("15 seconds");
    expect(formatRelativeTimeShort("2026-06-01T11:59:59.000Z", now)).toBe("1 second");
  });

  it("uses minutes under one hour", () => {
    expect(formatRelativeTimeShort("2026-06-01T11:55:00.000Z", now)).toBe("5 minutes");
    expect(formatRelativeTimeShort("2026-06-01T11:59:00.000Z", now)).toBe("1 minute");
  });

  it("uses hours under one day", () => {
    expect(formatRelativeTimeShort("2026-06-01T11:00:00.000Z", now)).toBe("1 hour");
    expect(formatRelativeTimeShort("2026-06-01T06:00:00.000Z", now)).toBe("6 hours");
  });

  it("uses days under one month", () => {
    expect(formatRelativeTimeShort("2026-05-29T12:00:00.000Z", now)).toBe("3 days");
    expect(formatRelativeTimeShort("2026-05-03T12:00:00.000Z", now)).toBe("29 days");
  });

  it("uses months under one year", () => {
    expect(formatRelativeTimeShort("2026-04-01T12:00:00.000Z", now)).toBe("2 months");
    expect(formatRelativeTimeShort("2025-06-02T12:00:00.000Z", now)).toBe("12 months");
  });

  it("uses years at one year and beyond", () => {
    expect(formatRelativeTimeShort("2025-06-01T12:00:00.000Z", now)).toBe("1 year");
    expect(formatRelativeTimeShort("2024-06-01T12:00:00.000Z", now)).toBe("2 years");
  });

  it("returns just now for future or invalid dates", () => {
    expect(formatRelativeTimeShort("2026-06-01T12:01:00.000Z", now)).toBe("just now");
    expect(formatRelativeTimeShort("not-a-date", now)).toBe("just now");
  });
});
