"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchCustomThemeLibrary,
  setActiveCustomTheme,
  type CustomThemeLibraryEntry,
} from "@/lib/customTheme";

type Props = {
  id?: string;
  className?: string;
  disabled?: boolean;
};

const DEFAULT_VALUE = "";

export function CustomThemeSelect({ id = "custom-theme", className = "", disabled = false }: Props) {
  const { user, refresh } = useAuth();
  const [items, setItems] = useState<CustomThemeLibraryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadLibrary = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchCustomThemeLibrary();
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const activeId = user?.active_custom_theme_library_id ?? null;
  const selectValue = activeId ?? DEFAULT_VALUE;

  const opts = useMemo(() => {
    const base = items.map((item) => ({
      value: item.id,
      label: item.source === "own" ? `${item.name} (yours)` : item.name,
    }));
    if (activeId && !base.some((o) => o.value === activeId)) {
      base.unshift({ value: activeId, label: "Selected theme" });
    }
    return base;
  }, [items, activeId]);

  const onChange = useCallback(
    async (next: string) => {
      if (!user || busy) return;
      setBusy(true);
      try {
        await setActiveCustomTheme(next === DEFAULT_VALUE ? null : next);
        await refresh();
        await loadLibrary();
      } catch {
        /* keep prior selection */
      } finally {
        setBusy(false);
      }
    },
    [user, busy, refresh, loadLibrary],
  );

  if (!mounted || !user) {
    return (
      <select id={id} disabled className={className} aria-hidden>
        <option>…</option>
      </select>
    );
  }

  return (
    <select
      id={id}
      value={selectValue}
      disabled={disabled || busy || loading}
      onChange={(e) => void onChange(e.target.value)}
      className={className}
      aria-label="Custom theme"
    >
      <option value={DEFAULT_VALUE}>Kurator palette (default)</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
