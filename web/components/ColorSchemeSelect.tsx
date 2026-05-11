"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { patchProfile } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import {
  COLOR_SCHEMES_ACCESSIBLE,
  COLOR_SCHEMES_BASE,
  colorSchemeLabel,
} from "@/lib/colorScheme";
import type { ColorScheme } from "@/lib/colorScheme";

type Props = {
  id?: string;
  className?: string;
  disabled?: boolean;
  /** When false, accessible-only palette values are hidden (not removed from server). */
  accessibleExtrasEnabled: boolean;
};

export function ColorSchemeSelect({
  id = "color-scheme",
  className = "",
  disabled = false,
  accessibleExtrasEnabled,
}: Props) {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rawScheme = (user?.color_scheme ?? "default") as ColorScheme;

  const opts = useMemo(() => {
    const base = [
      ...COLOR_SCHEMES_BASE,
      ...(accessibleExtrasEnabled ? COLOR_SCHEMES_ACCESSIBLE : []),
    ];
    if (base.some((o) => o.value === rawScheme)) return base;
    return [...base, { value: rawScheme, label: colorSchemeLabel(rawScheme) }];
  }, [accessibleExtrasEnabled, rawScheme]);

  const onChange = useCallback(
    async (next: ColorScheme) => {
      if (!user || busy) return;
      setBusy(true);
      try {
        await patchProfile({ color_scheme: next });
        await refresh();
      } catch {
        /* keep UI value; parent refresh may restore */
      } finally {
        setBusy(false);
      }
    },
    [user, busy, refresh],
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
      value={rawScheme}
      disabled={disabled || busy}
      onChange={(e) => void onChange(e.target.value as ColorScheme)}
      className={className}
      aria-label="Colour scheme"
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
