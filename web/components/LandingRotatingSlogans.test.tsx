import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingRotatingSlogans } from "./LandingRotatingSlogans";

const TEST_SLOGANS = ["First slogan.", "Second slogan."];

describe("LandingRotatingSlogans", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)" ? false : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the first slogan initially", () => {
    render(<LandingRotatingSlogans slogans={TEST_SLOGANS} />);
    expect(screen.getByText("First slogan.")).toBeInTheDocument();
  });

  it("rotates to the next slogan after the display interval", () => {
    render(<LandingRotatingSlogans slogans={TEST_SLOGANS} />);

    act(() => {
      vi.advanceTimersByTime(5_600);
    });

    expect(screen.getByText("Second slogan.")).toBeInTheDocument();
  });
});
