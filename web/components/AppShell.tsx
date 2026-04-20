"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { LoggedInFeatureFlags } from "@/components/LoggedInFeatureFlags";
import { useAuth } from "@/components/AuthProvider";

/** Routes that require a signed-in session. Everything else (including unknown URLs / 404) stays reachable while logged out. */
function requiresAuth(pathname: string): boolean {
  if (pathname.startsWith("/profile")) return true;
  if (pathname.startsWith("/collections")) return true;
  if (pathname.startsWith("/wishlists")) return true;
  if (pathname.startsWith("/items")) return true;
  if (pathname.startsWith("/scan")) return true;
  return false;
}

function FullPageLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-kurator-bg px-4">
      <p className="text-sm text-kurator-muted">Loading…</p>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const needsAuth = requiresAuth(pathname);

  useEffect(() => {
    if (user === null && needsAuth) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [user, needsAuth, pathname, router]);

  useEffect(() => {
    if (
      user &&
      (pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/forgot-password"))
    ) {
      router.replace("/");
    }
  }, [user, pathname, router]);

  if (user === undefined) {
    return <FullPageLoading />;
  }

  if (user === null && needsAuth) {
    return <FullPageLoading />;
  }

  if (
    user &&
    (pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/forgot-password"))
  ) {
    return <FullPageLoading />;
  }

  if (!user) {
    return <div className="min-h-dvh bg-kurator-bg">{children}</div>;
  }

  return (
    <LoggedInFeatureFlags user={user}>
      <AppChrome>{children}</AppChrome>
    </LoggedInFeatureFlags>
  );
}
