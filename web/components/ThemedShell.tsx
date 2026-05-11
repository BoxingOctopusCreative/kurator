"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useLayoutEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { applyDocumentFont } from "@/lib/documentFont";

function UserThemeSync() {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!user) return;
    setTheme(user.theme_preference);
  }, [user, setTheme]);

  return null;
}

/** Applies signed-in colour palette to <html data-palette> for CSS token sets. */
function PaletteSync() {
  const { user } = useAuth();

  useEffect(() => {
    const scheme = (user?.color_scheme ?? "default").trim() || "default";
    document.documentElement.dataset.palette = scheme;
  }, [user?.color_scheme, user]);

  return null;
}

/** Applies UI font to <html> (dataset + inline --font-sans so Tailwind layers always pick up the stack). */
function FontSync() {
  const { user } = useAuth();

  useLayoutEffect(() => {
    if (user === undefined) return;
    applyDocumentFont(user?.font_family);
  }, [user?.font_family, user]);

  return null;
}

/** Wraps the app with next-themes. Logged-out sessions stay on the dark palette; signed-in users control theme via their profile. */
export function ThemedShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const forcedTheme = user === undefined || user === null ? "dark" : undefined;

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={forcedTheme} disableTransitionOnChange>
      <UserThemeSync />
      <PaletteSync />
      <FontSync />
      {children}
    </ThemeProvider>
  );
}
