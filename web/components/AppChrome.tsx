"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Home,
  Layers,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { GlobalSearchBar } from "@/components/GlobalSearchBar";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { TopBarCreateMenu } from "@/components/TopBarCreateMenu";
import { SidebarBrandLogo } from "@/components/SidebarBrandLogo";
import { Copyright } from "@/components/Copyright";
import { LegalPolicyLinks } from "@/components/LegalPolicyLinks";
import {
  isLegalDocumentPath,
  persistSidebarCollapsedPreference,
  readSidebarCollapsedPreference,
  SIDEBAR_COLLAPSED_CHANGED_EVENT,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from "@/lib/sidebarCollapsedPreference";

const navHome = { href: "/", label: "Home", icon: Home } as const;
const socialSubItems = [
  { href: "/lists", label: "Hitlists", icon: ThumbsUp },
  { href: "/boards", label: "Boards", icon: MessageSquare },
] as const;
const shelfSubItems = [
  { href: "/collections", label: "Collections", icon: Layers },
  { href: "/wishlists", label: "Wishlists", icon: Heart },
] as const;

/** Measured from the sticky top bar; used for sidebar `top` / `height` on md+. */
const APP_CHROME_TOPBAR_HEIGHT_VAR = "--app-chrome-topbar-height";

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
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

  /** Collapse for legal-link clicks only; does not change compact-mode preference. */
  const collapseTransient = useCallback(() => {
    setCollapsed(true);
  }, []);

  return { collapsed, toggle, collapseTransient, setCollapsed };
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
  termsActive,
  sitemapActive,
  onLegalLinkClick,
}: {
  privacyActive: boolean;
  termsActive: boolean;
  sitemapActive: boolean;
  onLegalLinkClick: () => void;
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
            <div
              className="mt-2 border-t border-kurator-border pt-2"
              onClick={() => setOpen(false)}
            >
              <LegalPolicyLinks
                className="flex flex-nowrap items-center gap-x-0.5 text-left text-[11px] leading-tight"
                linkClassName="inline-block shrink-0 px-0 py-1 text-kurator-muted transition-colors hover:text-kurator-fg"
                activeLinkClassName="inline-block shrink-0 px-0 py-1 text-kurator-fg transition-colors"
                termsActive={termsActive}
                privacyActive={privacyActive}
                sitemapActive={sitemapActive}
                onLinkClick={onLegalLinkClick}
                openInNewTab={false}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar, collapseTransient, setCollapsed } =
    useSidebarCollapsed();
  const onSidebarLegalLinkClick = useCallback(() => {
    collapseTransient();
  }, [collapseTransient]);
  const [closeNotif, setCloseNotif] = useState(0);
  const [closeAccount, setCloseAccount] = useState(0);
  const [closeCreate, setCloseCreate] = useState(0);
  const [compactTipPortalReady, setCompactTipPortalReady] = useState(false);
  const [compactTipLabel, setCompactTipLabel] = useState<string | null>(null);
  const [compactTipPos, setCompactTipPos] = useState<{ left: number; top: number } | null>(null);
  const compactTipAnchorRef = useRef<HTMLElement | null>(null);
  const chromeRootRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLElement>(null);

  const syncTopBarHeight = useCallback(() => {
    const bar = topBarRef.current;
    const root = chromeRootRef.current;
    if (!bar || !root) return;
    root.style.setProperty(APP_CHROME_TOPBAR_HEIGHT_VAR, `${bar.offsetHeight}px`);
  }, []);

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
    syncTopBarHeight();
    const bar = topBarRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(() => syncTopBarHeight());
    ro.observe(bar);
    window.addEventListener("resize", syncTopBarHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncTopBarHeight);
    };
  }, [syncTopBarHeight]);

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
    if (isLegalDocumentPath(pathname)) return;
    if (!readSidebarCollapsedPreference()) {
      setCollapsed(false);
    }
  }, [pathname, setCollapsed]);

  const mobileNav = useMemo(() => [...socialSubItems, ...shelfSubItems], []);

  const privacyActive = pathname === "/privacy" || pathname.startsWith("/privacy/");
  const termsActive = pathname === "/terms" || pathname.startsWith("/terms/");
  const sitemapActive = pathname === "/sitemap" || pathname.startsWith("/sitemap/");

  const [sidebarRailHover, setSidebarRailHover] = useState(false);
  const [sidebarRailFocus, setSidebarRailFocus] = useState(false);
  const sidebarRailHot = sidebarRailHover || sidebarRailFocus;

  const appTopBar = (
    <header
      ref={topBarRef}
      className="relative sticky top-0 z-50 flex w-full shrink-0 items-center justify-between border-b border-kurator-border bg-kurator-topbar px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] shadow-md md:px-6"
    >
      <Link href="/" className="relative z-10 shrink-0">
        <SidebarBrandLogo variant="wide-on-dark" />
      </Link>
      <div className="pointer-events-none absolute inset-x-4 top-1/2 z-20 flex -translate-y-1/2 justify-center md:inset-x-6">
        <GlobalSearchBar className="pointer-events-auto w-full max-w-md" />
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-2">
        <TopBarCreateMenu
          closeSignal={closeCreate}
          onMenuOpen={() => {
            setCloseNotif((n) => n + 1);
            setCloseAccount((n) => n + 1);
          }}
        />
        <NotificationDropdown
          closeSignal={closeNotif}
          onMenuOpen={() => {
            setCloseAccount((n) => n + 1);
            setCloseCreate((n) => n + 1);
          }}
        />
        <AccountMenu
          closeSignal={closeAccount}
          onMenuOpen={() => {
            setCloseNotif((n) => n + 1);
            setCloseCreate((n) => n + 1);
          }}
        />
      </div>
    </header>
  );

  return (
    <div
      ref={chromeRootRef}
      className="flex min-h-dvh flex-col"
      style={{ [APP_CHROME_TOPBAR_HEIGHT_VAR]: "3.75rem" }}
    >
      {appTopBar}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          className={`relative hidden shrink-0 transition-[width] duration-200 ease-out md:sticky md:top-[var(--app-chrome-topbar-height,3.75rem)] md:block md:h-[calc(100dvh-var(--app-chrome-topbar-height,3.75rem))] md:max-h-[calc(100dvh-var(--app-chrome-topbar-height,3.75rem))] md:self-start ${
            sidebarCollapsed ? "md:w-19" : "md:w-56"
          }`}
        >
        <aside
          className={`flex h-full min-h-0 w-full overflow-x-hidden border-r border-solid bg-kurator-surface transition-[border-right-width,border-right-color] duration-150 ease-out md:flex md:flex-col md:overflow-hidden md:pt-3 md:pb-6 ${
            sidebarRailHot
              ? "border-r-4 border-kurator-accent/35"
              : "border-r border-kurator-border"
          }`}
        >
        <div className={`flex min-h-0 flex-1 flex-col pt-1 ${sidebarCollapsed ? "px-1.5" : "px-3"}`}>
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
                icon: LucideIcon;
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

              const navSectionHeadingClass =
                "px-3 pb-1 text-xs font-bold uppercase tracking-wide text-kurator-muted/55";

              const renderNavSection = (
                id: string,
                label: string,
                items: readonly { href: string; label: string; icon: LucideIcon }[],
                showHeading = true
              ) => (
                <div
                  role="group"
                  aria-label={showHeading ? undefined : label}
                  aria-labelledby={showHeading ? `app-sidebar-${id}-heading` : undefined}
                  className="flex flex-col gap-0.5"
                >
                  {showHeading ? (
                    <p id={`app-sidebar-${id}-heading`} className={`${navSectionHeadingClass} pt-1`}>
                      {label}
                    </p>
                  ) : null}
                  {items.map((item) => renderLink(item))}
                </div>
              );

              return (
                <>
                  {renderLink(navHome)}
                  {renderNavSection("social", "Social", socialSubItems, !sidebarCollapsed)}
                  {renderNavSection("shelves", "Shelves", shelfSubItems, !sidebarCollapsed)}
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
                <SidebarLegalPopover
                  privacyActive={privacyActive}
                  termsActive={termsActive}
                  sitemapActive={sitemapActive}
                  onLegalLinkClick={onSidebarLegalLinkClick}
                />
              </div>
            ) : (
              <>
                <Copyright />
                <LegalPolicyLinks
                  className="flex flex-nowrap items-center justify-center gap-x-0.5 text-[11px] leading-tight"
                  linkClassName="shrink-0 px-0.5 py-1.5 text-kurator-muted transition-colors hover:text-kurator-fg"
                  activeLinkClassName="shrink-0 px-0.5 py-1.5 text-kurator-fg transition-colors"
                  termsActive={termsActive}
                  privacyActive={privacyActive}
                  sitemapActive={sitemapActive}
                  onLinkClick={onSidebarLegalLinkClick}
                  openInNewTab={false}
                />
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
        <div className="@container flex min-h-0 min-w-0 flex-1 flex-col bg-kurator-main pb-20 md:pb-0">
          <main className="flex-1 px-4 py-5 md:px-8 md:py-8">{children}</main>
        </div>
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
    </div>
  );
}
