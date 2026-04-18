"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

function UserThemeSync() {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!user) return;
    setTheme(user.theme_preference);
  }, [user, setTheme]);

  return null;
}

/** Wraps the app with next-themes. Logged-out sessions stay on the dark palette; signed-in users control theme via their profile. */
export function ThemedShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const forcedTheme = user === undefined || user === null ? "dark" : undefined;

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={forcedTheme} disableTransitionOnChange>
      <UserThemeSync />
      {children}
    </ThemeProvider>
  );
}
