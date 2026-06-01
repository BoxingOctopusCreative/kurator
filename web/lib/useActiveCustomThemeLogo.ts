"use client";

import { useEffect, useState } from "react";
import { CUSTOM_THEME_CHANGED_EVENT, readActiveCustomThemeLogo } from "@/lib/customTheme";

/** Re-renders when {@link applyCustomThemeToDocument} or {@link clearCustomThemeFromDocument} runs. */
export function useActiveCustomThemeLogo(): string | null {
  const [logo, setLogo] = useState<string | null>(() =>
    typeof document !== "undefined" ? readActiveCustomThemeLogo() : null,
  );

  useEffect(() => {
    const sync = () => setLogo(readActiveCustomThemeLogo());
    sync();
    window.addEventListener(CUSTOM_THEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CUSTOM_THEME_CHANGED_EVENT, sync);
  }, []);

  return logo;
}
