"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { patchProfile } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import { applyDocumentFont } from "@/lib/documentFont";
import {
  FONT_FAMILIES_ACCESSIBLE,
  FONT_FAMILIES_BASE,
  fontFamilyLabel,
} from "@/lib/fontFamily";
import type { FontFamily } from "@/lib/fontFamily";

type Props = {
  id?: string;
  className?: string;
  disabled?: boolean;
  /** When false, accessible reading faces are hidden from the list (server may still hold the value). */
  accessibleFontsEnabled: boolean;
};

export function FontFamilySelect({
  id = "font-family",
  className = "",
  disabled = false,
  accessibleFontsEnabled,
}: Props) {
  const { user, applySessionUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const raw = (user?.font_family ?? "default") as FontFamily;

  const opts = useMemo(() => {
    const base = [...FONT_FAMILIES_BASE, ...(accessibleFontsEnabled ? FONT_FAMILIES_ACCESSIBLE : [])];
    if (base.some((o) => o.value === raw)) return base;
    return [...base, { value: raw, label: fontFamilyLabel(raw) }];
  }, [accessibleFontsEnabled, raw]);

  const onChange = useCallback(
    async (next: FontFamily) => {
      if (!user || busy) return;
      const prevFf = (user.font_family ?? "default").trim() || "default";
      setBusy(true);
      applyDocumentFont(next);
      try {
        const u = await patchProfile({ font_family: next });
        applySessionUser(u);
      } catch {
        applyDocumentFont(prevFf);
      } finally {
        setBusy(false);
      }
    },
    [user, busy, applySessionUser],
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
      value={raw}
      disabled={disabled || busy}
      onChange={(e) => void onChange(e.target.value as FontFamily)}
      className={className}
      aria-label="Font"
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
