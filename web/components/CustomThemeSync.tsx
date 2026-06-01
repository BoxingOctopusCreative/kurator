"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  applyCustomThemeToDocument,
  clearCustomThemeFromDocument,
  fetchActiveCustomTheme,
} from "@/lib/customTheme";
import { isProPlan } from "@/lib/billing";

/** Loads and applies the signed-in user's active custom theme (Pro only). */
export function CustomThemeSync() {
  const { user, refresh } = useAuth();
  const activeRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const activeId = user?.active_custom_theme_library_id ?? null;
    const pro = isProPlan(user?.plan);

    if (!user || !pro) {
      clearCustomThemeFromDocument();
      activeRef.current = null;
      return;
    }

    if (activeId === activeRef.current) {
      return;
    }
    activeRef.current = activeId;

    if (!activeId) {
      clearCustomThemeFromDocument();
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const entry = await fetchActiveCustomTheme();
        if (cancelled) return;
        if (!entry?.yaml) {
          clearCustomThemeFromDocument();
          if (activeId) {
            void refresh();
          }
          return;
        }
        applyCustomThemeToDocument(entry.yaml);
      } catch {
        if (!cancelled) {
          clearCustomThemeFromDocument();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, user?.active_custom_theme_library_id, user?.plan, refresh]);

  return null;
}
