"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Avoid animating huge batches (many concurrent animations). */
export const MAX_LIST_FLY_IN_ITEMS = 48;
export const LIST_FLY_IN_CLEAR_MS = 520;
export const LIST_FLY_OUT_MS = 500;

export const LIST_FLY_IN_CLASS = "animate-shelf-fly-in";
export const LIST_FLY_OUT_CLASS = "animate-shelf-fly-out";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useListFlyIn<T extends { id: string }>(items: T[]) {
  const itemsIdsRef = useRef<Set<string>>(new Set());
  const clearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const [flyInIds, setFlyInIds] = useState<Set<string>>(() => new Set());
  const [flyOutIds, setFlyOutIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    itemsIdsRef.current = new Set(items.map((i) => i.id));
  }, [items]);

  useEffect(() => {
    const timers = clearTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const scheduleFlyInClear = useCallback((entryId: string) => {
    const existing = clearTimersRef.current.get(entryId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      clearTimersRef.current.delete(entryId);
      setFlyInIds((prev) => {
        if (!prev.has(entryId)) return prev;
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }, LIST_FLY_IN_CLEAR_MS);
    clearTimersRef.current.set(entryId, t);
  }, []);

  const registerFlyIn = useCallback(
    (addedIds: string[]) => {
      if (!addedIds.length) return;
      const capped =
        addedIds.length > MAX_LIST_FLY_IN_ITEMS ? [] : addedIds;
      if (!capped.length) return;
      setFlyInIds((prev) => {
        const next = new Set(prev);
        for (const eid of capped) next.add(eid);
        return next;
      });
      for (const eid of capped) scheduleFlyInClear(eid);
    },
    [scheduleFlyInClear],
  );

  const notifyNewItems = useCallback(
    (next: T[], flyInNew?: boolean) => {
      if (!flyInNew) return;
      const before = itemsIdsRef.current;
      const added = next.filter((i) => !before.has(i.id)).map((i) => i.id);
      registerFlyIn(added);
    },
    [registerFlyIn],
  );

  const cancelFlyOut = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setFlyOutIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const playFlyOut = useCallback((ids: string[]) => {
    if (!ids.length || ids.length > MAX_LIST_FLY_IN_ITEMS) {
      return Promise.resolve();
    }
    if (prefersReducedMotion()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      setFlyOutIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      window.setTimeout(() => {
        setFlyOutIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        resolve();
      }, LIST_FLY_OUT_MS);
    });
  }, []);

  const runWithFlyOut = useCallback(
    async (ids: string[], action: () => Promise<void>) => {
      const targets = ids.length > MAX_LIST_FLY_IN_ITEMS ? [] : ids;
      try {
        await playFlyOut(targets);
        await action();
      } catch (err) {
        cancelFlyOut(targets);
        throw err;
      }
    },
    [playFlyOut, cancelFlyOut],
  );

  const entryMotionClass = useCallback(
    (id: string) => {
      if (flyOutIds.has(id)) return LIST_FLY_OUT_CLASS;
      if (flyInIds.has(id)) return LIST_FLY_IN_CLASS;
      return "";
    },
    [flyInIds, flyOutIds],
  );

  return {
    notifyNewItems,
    entryMotionClass,
    entryFlyInClass: entryMotionClass,
    registerFlyIn,
    runWithFlyOut,
  };
}
