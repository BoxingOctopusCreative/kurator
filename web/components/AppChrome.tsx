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
  Library,
  PlusCircle,
  ThumbsUp,
  Users,
} from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import Image from "next/image";
import { Copyright } from "@/components/Copyright";
import {
  persistSidebarCollapsedPreference,
  readSidebarCollapsedPreference,
  SIDEBAR_COLLAPSED_CHANGED_EVENT,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from "@/lib/sidebarCollapsedPreference";

const navDashboard = { href: "/", label: "Dashboard", icon: LayoutGrid } as const;
const navPeople = { href: "/people", label: "People", icon: Users } as const;
const shelfSubItems = [
  { href: "/collections", label: "Collections", icon: Layers },
  { href: "/lists", label: "Hitlists", icon: ThumbsUp },
  { href: "/wishlists", label: "Wishlists", icon: Heart },
] as const;
const navAddItem = { href: "/items/add", label: "Add Item", icon: PlusCircle } as const;

const SHELF_PREFIXES = ["/collections", "/lists", "/wishlists"] as const;

function isShelfPath(pathname: string): boolean {
  return SHELF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Collapsed sidebar mark — theme-specific assets (no CSS filter). */
const SIDEBAR_MARK_LIGHT =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-black.svg";
const SIDEBAR_MARK_DARK =
  "https://assets.kuratorapp.cc/brand/SVG/kurator_favicon-white.svg";

function topRightSafeInsetStyle(): CSSProperties {
  return {
    top: "max(0.75rem, env(safe-area-inset-top, 0px))",
    /** Align with `<main className="… md:px-8">` (md+ only; this cluster is `md:flex`). */
    right: "max(2rem, env(safe-area-inset-right, 0px))",
  };
}

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsedPreference());

    function onCollapsedChanged(ev: Event) {
      const ce = ev as CustomEvent<boolean | undefined>;
      if (typeof ce.detail === "boolean") {
        setCollapsed(ce.detail);
        return;
      }
      setCollapsed(readSidebarCollapsedPreference());
    }

    function onStorage(e: StorageEvent) {
      if (e.key !== null && e.key !== SIDEBAR_COLLAPSED_STORAGE_KEY) return;
      setCollapsed(readSidebarCollapsedPreference());
    }

    window.addEventListener(SIDEBAR_COLLAPSED_CHANGED_EVENT, onCollapsedChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SIDEBAR_COLLAPSED_CHANGED_EVENT, onCollapsedChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      persistSidebarCollapsedPreference(next);
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

function CompactNavSidebarTooltipPortal({
  label,
  position,
  mounted,
}: {
  label: string;
  position: { left: number; top: number };
  mounted: boolean;
}) {
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        transform: "translateY(-50%)",
        zIndex: 400,
      }}
      className="pointer-events-none max-w-[min(16rem,calc(100vw-2rem))] truncate rounded-md border border-kurator-border bg-kurator-surface px-2 py-1 text-left text-xs font-medium text-kurator-fg shadow-dropdown"
    >
      {label}
    </div>,
    document.body
  );
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
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  const [closeNotif, setCloseNotif] = useState(0);
  const [closeAccount, setCloseAccount] = useState(0);
  const [shelvesOpen, setShelvesOpen] = useState(() => isShelfPath(pathname));
  const [compactTipPortalReady, setCompactTipPortalReady] = useState(false);
  const [compactTipLabel, setCompactTipLabel] = useState<string | null>(null);
  const [compactTipPos, setCompactTipPos] = useState<{ left: number; top: number } | null>(null);
  const compactTipAnchorRef = useRef<HTMLElement | null>(null);

  const hideCompactTip = useCallback(() => {
    compactTipAnchorRef.current = null;
    setCompactTipLabel(null);
    setCompactTipPos(null);
  }, []);

  const showCompactTip = useCallback((anchor: HTMLElement, label: string) => {
    compactTipAnchorRef.current = anchor;
    setCompactTipLabel(label);
    const r = anchor.getBoundingClientRect();
    setCompactTipPos({ left: r.right + 8, top: r.top + r.height / 2 });
  }, []);

  useEffect(() => {
    setCompactTipPortalReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!compactTipLabel) return;
    const sync = () => {
      const el = compactTipAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCompactTipPos({ left: r.right + 8, top: r.top + r.height / 2 });
    };
    sync();
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [compactTipLabel]);

  useEffect(() => {
    if (!sidebarCollapsed) hideCompactTip();
  }, [sidebarCollapsed, hideCompactTip]);

  useEffect(() => {
    if (isShelfPath(pathname)) setShelvesOpen(true);
  }, [pathname]);

  const mobileNav = useMemo(
    () => [navDashboard, navPeople, ...shelfSubItems, navAddItem],
    []
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
              ? "border-r-4 border-kurator-accent/35"
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
            {(() => {
              const linkClass = (active: boolean, collapsed: boolean) =>
                `flex items-center rounded-lg py-2 text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-2" : "gap-3 px-3"
                } ${
                  active
                    ? "bg-kurator-border text-kurator-fg"
                    : "text-kurator-muted hover:bg-kurator-border/60 hover:text-kurator-fg"
                }`;

              const renderLink = (item: {
                href: string;
                label: string;
                icon: typeof LayoutGrid;
              }) => {
                const active = isNavActive(item.href, pathname);
                const Icon = item.icon;
                if (!sidebarCollapsed) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={linkClass(active, sidebarCollapsed)}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  );
                }
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={linkClass(active, sidebarCollapsed)}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                );
                return (
                  <div
                    key={item.href}
                    className="flex w-full justify-center"
                    onMouseEnter={(e) => showCompactTip(e.currentTarget, item.label)}
                    onMouseLeave={hideCompactTip}
                  >
                    {link}
                  </div>
                );
              };

              return (
                <>
                  {renderLink(navDashboard)}
                  {renderLink(navPeople)}
                  {sidebarCollapsed ? (
                    shelfSubItems.map((item) => renderLink(item))
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        id="app-sidebar-shelves-trigger"
                        aria-expanded={shelvesOpen}
                        aria-controls="app-sidebar-shelves-panel"
                        onClick={() => setShelvesOpen((o) => !o)}
                        className={linkClass(isShelfPath(pathname), false)}
                      >
                        <Library className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 text-left">Shelves</span>
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                            shelvesOpen ? "rotate-90" : ""
                          }`}
                          aria-hidden
                        />
                      </button>
                      {shelvesOpen ? (
                        <div
                          id="app-sidebar-shelves-panel"
                          role="region"
                          aria-labelledby="app-sidebar-shelves-trigger"
                          className="ml-3 flex flex-col gap-0.5 border-l border-kurator-border/80 pl-2"
                        >
                          {shelfSubItems.map((item) => {
                            const active = isNavActive(item.href, pathname);
                            const Icon = item.icon;
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={linkClass(active, false)}
                              >
                                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                                <span>{item.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {renderLink(navAddItem)}
                </>
              );
            })()}
          </nav>
          <div className="mt-4 border-t border-kurator-border pt-3">
            {sidebarCollapsed ? (
              <div
                className="flex justify-center"
                onMouseEnter={(e) => showCompactTip(e.currentTarget, "Legal & privacy")}
                onMouseLeave={hideCompactTip}
              >
                <SidebarLegalPopover privacyActive={privacyActive} />
              </div>
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
        {compactTipLabel && compactTipPos ? (
          <CompactNavSidebarTooltipPortal
            label={compactTipLabel}
            position={compactTipPos}
            mounted={compactTipPortalReady}
          />
        ) : null}
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
        {mobileNav.map(({ href, label, icon: Icon }) => {
          const active = isNavActive(href, pathname);
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
