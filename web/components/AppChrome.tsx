"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  LayoutGrid,
  Layers,
  PlusCircle,
  ScanBarcode,
  UserCircle,
  Users,
} from "lucide-react";
import { UserBar } from "@/components/UserBar";
import Image from "next/image";
import { Copyright } from "@/components/Copyright";

const mainNav = [
  { href: "/", label: "Home", icon: LayoutGrid },
  { href: "/collections", label: "Collections", icon: Layers },
  { href: "/people", label: "People", icon: Users },
  { href: "/wishlists", label: "Wishlists", icon: Heart },
  { href: "/items/add", label: "Add", icon: PlusCircle },
  { href: "/scan", label: "Scan", icon: ScanBarcode },
];

const profileNavItem = {
  href: "/profile",
  label: "Profile",
  icon: UserCircle,
} as const;

/** Bottom tab bar (mobile): profile stays last but grouped with the rest for layout. */
const nav = [...mainNav, profileNavItem];

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const profileActive =
    pathname === profileNavItem.href || pathname.startsWith(`${profileNavItem.href}/`);
  const privacyActive = pathname === "/privacy" || pathname.startsWith("/privacy/");
  const ProfileIcon = profileNavItem.icon;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-kurator-border bg-kurator-surface md:flex md:h-dvh md:max-h-dvh md:flex-col md:overflow-y-auto md:self-start md:py-6 md:sticky md:top-0">
        <div className="px-5 pb-6">
          <Link href="/" className="mb-4 flex justify-center">
            <Image
              src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
              alt="Kurator"
              width={256}
              height={128}
              className="h-auto w-32 invert dark:invert-0"
            />
          </Link>
          <p className="mt-1 text-center text-sm text-kurator-muted">Collection tracker</p>
        </div>
        <div className="px-5 pb-4">
          <UserBar />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3">
          <nav className="flex flex-1 flex-col gap-1" aria-label="Primary">
            {mainNav.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/"
                  ? pathname === "/"
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-kurator-border text-kurator-fg"
                      : "text-kurator-muted hover:bg-kurator-border/60 hover:text-kurator-fg"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              );
            })}
            <div className="mt-auto border-t border-kurator-border pt-3">
              <Link
                href={profileNavItem.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  profileActive
                    ? "bg-kurator-border text-kurator-fg"
                    : "text-kurator-muted hover:bg-kurator-border/60 hover:text-kurator-fg"
                }`}
              >
                <ProfileIcon className="h-4 w-4 shrink-0" aria-hidden />
                {profileNavItem.label}
              </Link>
            </div>
          </nav>
          <div className="mt-4 border-t border-kurator-border pt-3">
            <Copyright />
            <Link
              href="/privacy"
              className={`block px-3 py-1.5 text-xs transition-colors ${
                privacyActive ? "text-kurator-fg" : "text-kurator-muted hover:text-kurator-fg"
              }`}
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="flex items-center justify-between gap-3 border-b border-kurator-border bg-kurator-surface/80 px-4 py-3 backdrop-blur-md md:hidden">
          <Link href="/" className="text-base font-semibold text-kurator-fg">
            <Image
              src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
              alt="Kurator"
              width={256}
              height={128}
              className="h-auto w-32 invert dark:invert-0"
            />
          </Link>
          <UserBar />
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>

      <nav
        className="safe-pb fixed bottom-0 left-0 right-0 z-40 flex border-t border-kurator-border bg-kurator-surface/95 backdrop-blur-md md:hidden"
        aria-label="Primary"
      >
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium ${
                active ? "text-kurator-accent" : "text-kurator-muted"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
