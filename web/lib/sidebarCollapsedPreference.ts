/** Persists the desktop sidebar compact mode state (narrow rail, icons only). Used by AppChrome and App Settings. */

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "kurator.sidebarCollapsed";

/** Same-tab listeners (localStorage mutation does not fire `storage` in the active tab). */
export const SIDEBAR_COLLAPSED_CHANGED_EVENT = "kurator.sidebar-collapsed-changed";

/** Parse stored value used by Kurator sidebar; defaults to expanded when unset/unknown. */
export function parseSidebarCollapsedStored(raw: string | null): boolean {
  return raw === "1";
}

export function serializeSidebarCollapsed(collapsed: boolean): "0" | "1" {
  return collapsed ? "1" : "0";
}

export function readSidebarCollapsedPreference(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return parseSidebarCollapsedStored(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function persistSidebarCollapsedPreference(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, serializeSidebarCollapsed(collapsed));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SIDEBAR_COLLAPSED_CHANGED_EVENT, { detail: collapsed }));
  }
}
