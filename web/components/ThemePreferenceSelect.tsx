"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { patchProfile, type ThemePreference } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

type Props = {
  id?: string;
  className?: string;
  disabled?: boolean;
};

export function ThemePreferenceSelect({ id = "theme-preference", className = "", disabled = false }: Props) {
  const { user, refresh } = useAuth();
  const { setTheme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const value = user?.theme_preference ?? "system";

  const onChange = useCallback(
    async (next: ThemePreference) => {
      if (!user || busy) return;
      setBusy(true);
      try {
        setTheme(next);
        await patchProfile({ theme_preference: next });
        await refresh();
      } catch {
        setTheme(user.theme_preference);
      } finally {
        setBusy(false);
      }
    },
    [user, busy, setTheme, refresh]
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
      value={value}
      disabled={disabled || busy}
      onChange={(e) => void onChange(e.target.value as ThemePreference)}
      className={className}
      aria-label="Color theme"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
