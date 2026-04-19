"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { useAuth } from "@/components/AuthProvider";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/register")) return true;
  if (pathname.startsWith("/forgot-password")) return true;
  if (pathname.startsWith("/setup")) return true;
  if (pathname.startsWith("/privacy")) return true;
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
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    if (user === null && !isPublic) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [user, isPublic, pathname, router]);

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

  if (user === null && !isPublic) {
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

  return <AppChrome>{children}</AppChrome>;
}
