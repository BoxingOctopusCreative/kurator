"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  LayoutGrid,
  Layers,
  ListOrdered,
  PlusCircle,
  ScanBarcode,
  Users,
} from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import Image from "next/image";
import { Copyright } from "@/components/Copyright";
import { useFeatureGates } from "@/components/LoggedInFeatureFlags";

const mainNavBase = [
  { href: "/", label: "Home", icon: LayoutGrid },
  { href: "/collections", label: "Collections", icon: Layers },
  { href: "/people", label: "People", icon: Users },
  { href: "/wishlists", label: "Wishlists", icon: Heart },
  { href: "/lists", label: "Lists", icon: ListOrdered },
  { href: "/items/add", label: "Add Item", icon: PlusCircle },
] as const;

const scanNavItem = { href: "/scan", label: "Scan", icon: ScanBarcode } as const;

/** Collapsed sidebar mark — theme-specific assets (no CSS filter). */
const SIDEBAR_MARK_LIGHT =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-black.svg";
const SIDEBAR_MARK_DARK =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-white.svg";

const SIDEBAR_COLLAPSED_KEY = "kurator.sidebarCollapsed";

function topRightSafeInsetStyle(): CSSProperties {
  return {
    top: "max(0.75rem, env(safe-area-inset-top, 0px))",
    right: "max(0.75rem, env(safe-area-inset-right, 0px))",
  };
}

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

function SidebarLegalPopover({
  privacyActive,
}: {
  privacyActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncPanelPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPanelPos({
      left: rect.left,
      bottom: window.innerHeight - rect.top + 8,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncPanelPosition();
    const onWin = () => syncPanelPosition();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, syncPanelPosition]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      const t = ev.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex justify-center">
      <button
        ref={buttonRef}
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-semibold text-kurator-muted transition-colors hover:bg-kurator-border/60 hover:text-kurator-fg"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Copyright and privacy information"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {mounted &&
        open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Legal information"
            style={{
              position: "fixed",
              left: panelPos.left,
              bottom: panelPos.bottom,
              zIndex: 200,
            }}
            className="w-max max-w-[min(17rem,calc(100vw-1rem))] rounded-lg border border-kurator-border bg-kurator-surface p-3 text-left text-kurator-fg shadow-lg dark:shadow-black/40"
          >
            <div className="[&>div]:items-start [&_p]:text-left">
              <Copyright />
            </div>
            <div className="mt-2 border-t border-kurator-border pt-2">
              <Link
                href="/privacy"
                className={`inline-block px-0 py-1 text-xs transition-colors ${
                  privacyActive ? "text-kurator-fg" : "text-kurator-muted hover:text-kurator-fg"
                }`}
                onClick={() => setOpen(false)}
              >
                Privacy Policy
              </Link>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { showBarcodeScanNav } = useFeatureGates();
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  const [closeNotif, setCloseNotif] = useState(0);
  const [closeAccount, setCloseAccount] = useState(0);

  const mainNav = useMemo(
    () => (showBarcodeScanNav ? [...mainNavBase, scanNavItem] : [...mainNavBase]),
    [showBarcodeScanNav]
  );

  const privacyActive = pathname === "/privacy" || pathname.startsWith("/privacy/");

  const [sidebarRailHover, setSidebarRailHover] = useState(false);
  const [sidebarRailFocus, setSidebarRailFocus] = useState(false);
  const sidebarRailHot = sidebarRailHover || sidebarRailFocus;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <div
        className={`relative hidden shrink-0 transition-[width] duration-200 ease-out md:block md:h-dvh md:max-h-dvh md:self-start md:sticky md:top-0 ${
          sidebarCollapsed ? "md:w-19" : "md:w-56"
        }`}
      >
        <aside
          className={`flex h-full overflow-x-hidden border-r border-solid bg-kurator-surface transition-[border-right-width,border-right-color] duration-150 ease-out md:flex md:flex-col md:overflow-hidden md:py-6 ${
            sidebarRailHot
              ? "border-r-[4px] border-kurator-accent/35"
              : "border-r border-kurator-border"
          }`}
        >
        <div className={`mb-4 mt-2 pb-2 ${sidebarCollapsed ? "px-1.5" : "px-3"}`}>
          <div className="border-b border-kurator-border pb-3">
            <Link
              href="/"
              className={`flex ${sidebarCollapsed ? "justify-center px-0.5" : "justify-center px-2"}`}
            >
              {sidebarCollapsed ? (
                <>
                  <Image
                    src={SIDEBAR_MARK_LIGHT}
                    alt="Kurator"
                    width={32}
                    height={32}
                    className="h-8 w-8 dark:hidden"
                    loading="eager"
                  />
                  <Image
                    src={SIDEBAR_MARK_DARK}
                    alt="Kurator"
                    width={32}
                    height={32}
                    className="hidden h-8 w-8 dark:block"
                    loading="eager"
                  />
                </>
              ) : (
                <Image
                  src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
                  alt="Kurator"
                  width={256}
                  height={128}
                  className="h-auto w-48 invert dark:invert-0"
                  loading="eager"
                />
              )}
            </Link>
          </div>
        </div>
        <div className={`flex min-h-0 flex-1 flex-col ${sidebarCollapsed ? "px-1.5" : "px-3"}`}>
          <nav
            id="app-sidebar-primary"
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
            aria-label="Primary"
          >
            {mainNav.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/"
                  ? pathname === "/"
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  title={sidebarCollapsed ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center rounded-lg py-2 text-sm font-medium transition-colors ${
                    sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3"
                  } ${
                    active
                      ? "bg-kurator-border text-kurator-fg"
                      : "text-kurator-muted hover:bg-kurator-border/60 hover:text-kurator-fg"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className={sidebarCollapsed ? "sr-only" : undefined}>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 border-t border-kurator-border pt-3">
            {sidebarCollapsed ? (
              <SidebarLegalPopover privacyActive={privacyActive} />
            ) : (
              <>
                <Copyright />
                <div className="flex justify-center">
                  <Link
                    href="/privacy"
                    className={`px-3 py-1.5 text-xs transition-colors ${
                      privacyActive ? "text-kurator-fg" : "text-kurator-muted hover:text-kurator-fg"
                    }`}
                  >
                    Privacy Policy
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
        {/* Hit corridor + control on the sidebar / main boundary (md+) */}
        <div
          className="absolute inset-y-0 right-0 z-30 flex w-10 max-w-[min(2.5rem,calc(50vw))] translate-x-1/2 cursor-pointer items-center justify-center"
          role="presentation"
          onMouseEnter={() => setSidebarRailHover(true)}
          onMouseLeave={() => setSidebarRailHover(false)}
        >
          <button
            type="button"
            aria-expanded={!sidebarCollapsed}
            aria-controls="app-sidebar-primary"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`pointer-events-auto flex size-8 shrink-0 items-center justify-center rounded-full border border-kurator-border bg-kurator-surface text-kurator-muted shadow-sm transition-opacity duration-150 hover:bg-kurator-border/50 hover:text-kurator-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kurator-accent ${
              sidebarRailHot ? "opacity-100" : "opacity-0"
            }`}
            onClick={toggleSidebar}
            onFocus={() => setSidebarRailFocus(true)}
            onBlur={() => setSidebarRailFocus(false)}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>
      <div className="@container flex min-w-0 flex-1 flex-col bg-kurator-main pb-20 md:pb-0">
        <header className="sticky top-0 z-50 flex md:hidden items-center justify-between gap-3 border-b border-kurator-border bg-kurator-surface/95 pb-3 pl-4 pr-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] backdrop-blur-md">
          <Link href="/" className="min-w-0 shrink text-base font-semibold text-kurator-fg">
            <Image
              src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
              alt="Kurator"
              width={256}
              height={128}
              className="h-auto w-32 invert dark:invert-0"
              loading="eager"
            />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationDropdown
              closeSignal={closeNotif}
              onMenuOpen={() => setCloseAccount((n) => n + 1)}
            />
            <AccountMenu closeSignal={closeAccount} onMenuOpen={() => setCloseNotif((n) => n + 1)} />
          </div>
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>

      <nav
        className="safe-pb fixed bottom-0 left-0 right-0 z-40 flex border-t border-kurator-border bg-kurator-surface/95 backdrop-blur-md md:hidden"
        aria-label="Primary"
      >
        {mainNav.map(({ href, label, icon: Icon }) => {
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
      <div
        className="pointer-events-none fixed z-100 hidden justify-end md:flex"
        style={topRightSafeInsetStyle()}
      >
        <div className="pointer-events-auto flex items-start gap-2">
          <NotificationDropdown
            closeSignal={closeNotif}
            onMenuOpen={() => setCloseAccount((n) => n + 1)}
          />
          <AccountMenu closeSignal={closeAccount} onMenuOpen={() => setCloseNotif((n) => n + 1)} />
        </div>
      </div>
    </div>
  );
}
