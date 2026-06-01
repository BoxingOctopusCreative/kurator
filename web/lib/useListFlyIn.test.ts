import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIST_FLY_IN_CLASS,
  LIST_FLY_OUT_CLASS,
  LIST_FLY_OUT_MS,
  MAX_LIST_FLY_IN_ITEMS,
  useListFlyIn,
} from "./useListFlyIn";

describe("useListFlyIn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("marks new ids when notifyNewItems runs with flyInNew", () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: { id: string }[] }) => useListFlyIn(items),
      { initialProps: { items: [{ id: "a" }] } },
    );

    act(() => {
      result.current.notifyNewItems([{ id: "a" }, { id: "b" }], true);
    });

    expect(result.current.entryMotionClass("b")).toBe(LIST_FLY_IN_CLASS);
    expect(result.current.entryMotionClass("a")).toBe("");

    rerender({ items: [{ id: "a" }, { id: "b" }] });
    expect(result.current.entryMotionClass("b")).toBe(LIST_FLY_IN_CLASS);
  });

  it("skips fly-in when more than MAX_LIST_FLY_IN_ITEMS are new", () => {
    const { result } = renderHook(() => useListFlyIn([{ id: "existing" }]));

    const next = [{ id: "existing" }];
    for (let i = 0; i < MAX_LIST_FLY_IN_ITEMS + 5; i += 1) {
      next.push({ id: `new-${i}` });
    }

    act(() => {
      result.current.notifyNewItems(next, true);
    });

    expect(result.current.entryMotionClass("new-0")).toBe("");
  });

  it("runs removal action after fly-out delay", async () => {
    const { result } = renderHook(() => useListFlyIn([{ id: "x" }]));
    let actionRan = false;

    await act(async () => {
      const p = result.current.runWithFlyOut(["x"], async () => {
        actionRan = true;
      });
      await vi.advanceTimersByTimeAsync(LIST_FLY_OUT_MS);
      await p;
    });

    expect(actionRan).toBe(true);
  });

  it("fly-out takes precedence over fly-in on the same id", () => {
    const { result } = renderHook(() => useListFlyIn([{ id: "x" }]));

    act(() => {
      result.current.notifyNewItems([{ id: "x" }], true);
    });

    act(() => {
      void result.current.runWithFlyOut(["x"], async () => {});
    });

    expect(result.current.entryMotionClass("x")).toBe(LIST_FLY_OUT_CLASS);
  });
});
