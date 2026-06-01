import yaml from "js-yaml";
import { apiUrl } from "./apiUrl";
import { safeImageSrcUrl } from "./safeUrl";

export type CustomThemeFieldError = {
  field: string;
  message: string;
};

export type CustomThemeValidationResult = {
  valid: boolean;
  errors?: CustomThemeFieldError[];
};

export type CustomThemePayload = {
  schemaVersion: string;
  meta: {
    name: string;
    description: string;
    published: boolean;
  };
  branding: {
    logo: { url: string };
  };
  appearance: {
    colors: {
      primary: string;
      secondary: string;
      background: string;
      surface: string;
      accent: string;
      text: string;
      border: string;
      interactive: string;
    };
    font: {
      source: "google" | "typekit";
      name: string;
      kitId?: string | null;
      size: number;
      lineHeight: number;
      display: string;
      fallback: string;
    };
    icons: {
      source: "iconify";
      set: string;
    };
  };
};

export type CustomThemeDocument = {
  customTheme: CustomThemePayload;
};

export const DEFAULT_CUSTOM_THEME_YAML = `---
customTheme:
  schemaVersion: "v1"
  meta:
    name: "my-custom-theme"
    description: "My custom theme"
    published: false
  branding:
    logo:
      url: "https://assets.kuratorapp.cc/brand/PNG/kurator_favicon-white.png"
  appearance:
    colors:
      primary: "#000000"
      secondary: "#FFFFFF"
      background: "#121212"
      surface: "#1E1E1E"
      accent: "#6200EE"
      text: "#FFFFFF"
      border: "#333333"
      interactive: "#BB86FC"
    font:
      source: "google"
      name: "Inter"
      size: 16
      lineHeight: 1.5
      display: "swap"
      fallback: "system-ui"
    icons:
      source: "iconify"
      set: "lucide"
`;

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.message === "string") return j.message;
    if (typeof j.error === "string" && j.error !== "true") return j.error;
  } catch {
    /* ignore */
  }
  if (text) return text.slice(0, 200);
  return `request failed (${res.status})`;
}

export class ProRequiredError extends Error {
  constructor(message = "This feature requires Kurator Pro") {
    super(message);
    this.name = "ProRequiredError";
  }
}

async function themeApi(path: string, init?: RequestInit) {
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });
}

export function isProRequiredResponse(res: Response, body?: Record<string, unknown>): boolean {
  if (res.status !== 403) return false;
  if (body?.error === "pro_required") return true;
  return false;
}

export async function fetchMyCustomTheme(): Promise<{
  yaml: string;
  theme_id?: string;
  published_version_count?: number;
}> {
  const res = await themeApi("/me/custom-theme");
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = (await res.json()) as {
    yaml?: string;
    theme_id?: string;
    published_version_count?: number;
  };
  return {
    yaml: data.yaml ?? DEFAULT_CUSTOM_THEME_YAML,
    theme_id: data.theme_id,
    published_version_count: data.published_version_count,
  };
}

export async function validateCustomThemeYaml(yaml: string): Promise<CustomThemeValidationResult> {
  const res = await themeApi("/me/custom-theme/validate", {
    method: "POST",
    body: JSON.stringify({ yaml }),
  });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as CustomThemeValidationResult;
}

export async function saveCustomThemeYaml(yaml: string): Promise<CustomThemeValidationResult & { yaml: string }> {
  const res = await themeApi("/me/custom-theme", {
    method: "PUT",
    body: JSON.stringify({ yaml }),
  });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  const data = (await res.json()) as CustomThemeValidationResult & { yaml?: string };
  if (!res.ok) {
    if (!data.valid && data.errors) {
      return data;
    }
    throw new Error(await readApiError(res));
  }
  return { ...data, yaml: data.yaml ?? yaml };
}

export async function resetCustomTheme(): Promise<void> {
  const res = await themeApi("/me/custom-theme", { method: "DELETE" });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

/** Filters Google Font family names for autocomplete (case-insensitive substring). */
export function filterGoogleFontNames(families: string[], query: string, limit = 25): string[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return families.slice(0, limit);
  }
  const out: string[] = [];
  for (const name of families) {
    if (name.toLowerCase().includes(q)) {
      out.push(name);
      if (out.length >= limit) break;
    }
  }
  return out;
}

let googleFontNamesCache: string[] | null = null;
let googleFontNamesPromise: Promise<string[]> | null = null;

export async function fetchGoogleFontNames(): Promise<string[]> {
  if (googleFontNamesCache) {
    return googleFontNamesCache;
  }
  if (googleFontNamesPromise) {
    return googleFontNamesPromise;
  }
  googleFontNamesPromise = (async () => {
    const res = await themeApi("/me/custom-theme/google-fonts");
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (isProRequiredResponse(res, body)) {
        throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
      }
    }
    if (!res.ok) {
      throw new Error(await readApiError(res));
    }
    const data = (await res.json()) as { families?: string[] };
    const families = Array.isArray(data.families) ? data.families.filter((f) => typeof f === "string") : [];
    googleFontNamesCache = families;
    return families;
  })();
  try {
    return await googleFontNamesPromise;
  } finally {
    googleFontNamesPromise = null;
  }
}

export async function publishCustomTheme(): Promise<void> {
  const res = await themeApi("/me/custom-theme/publish", { method: "POST", body: "{}" });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

export async function unpublishCustomTheme(): Promise<{ active_cleared: boolean; theme_name?: string }> {
  const res = await themeApi("/me/custom-theme/unpublish", { method: "POST", body: "{}" });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = (await res.json()) as { active_cleared?: boolean; theme_name?: string };
  return { active_cleared: data.active_cleared === true, theme_name: data.theme_name };
}

export async function deleteCreatedCustomTheme(): Promise<void> {
  const res = await themeApi("/me/custom-theme/created", { method: "DELETE" });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

export type CustomThemeLibraryEntry = {
  id: string;
  source: "own" | "marketplace";
  ref_id: string;
  name: string;
  description: string;
  yaml?: string;
  created_at?: string;
};

export async function fetchCustomThemeLibrary(): Promise<{
  items: CustomThemeLibraryEntry[];
  active_custom_theme_library_id?: string | null;
}> {
  const res = await themeApi("/me/custom-theme/library");
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as {
    items: CustomThemeLibraryEntry[];
    active_custom_theme_library_id?: string | null;
  };
}

export async function installMarketplaceTheme(publishedThemeId: string): Promise<CustomThemeLibraryEntry> {
  const res = await themeApi("/me/custom-theme/library", {
    method: "POST",
    body: JSON.stringify({ published_theme_id: publishedThemeId }),
  });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as CustomThemeLibraryEntry;
}

export async function removeCustomThemeFromLibrary(libraryId: string): Promise<void> {
  const res = await themeApi(`/me/custom-theme/library/${encodeURIComponent(libraryId)}`, {
    method: "DELETE",
  });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

export async function setActiveCustomTheme(libraryId: string | null): Promise<void> {
  const res = await themeApi("/me/custom-theme/active", {
    method: "PATCH",
    body: JSON.stringify({ library_id: libraryId }),
  });
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
}

export async function fetchActiveCustomTheme(): Promise<CustomThemeLibraryEntry | null> {
  const res = await themeApi("/me/custom-theme/active");
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (isProRequiredResponse(res, body)) {
      throw new ProRequiredError(typeof body.message === "string" ? body.message : undefined);
    }
  }
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = (await res.json()) as CustomThemeLibraryEntry & { active?: boolean };
  if (data.active === false) {
    return null;
  }
  return data;
}

export type PublishedCustomThemeSummary = {
  id: string;
  name: string;
  description: string;
  author_display_name: string;
  author_user_id?: number;
  version: number;
};

export async function listPublishedCustomThemes(query = ""): Promise<{
  items: PublishedCustomThemeSummary[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  params.set("limit", "20");
  const res = await fetch(apiUrl(`/custom-themes?${params.toString()}`), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as { items: PublishedCustomThemeSummary[]; total: number };
}

const CUSTOM_THEME_CSS_VARS = [
  "--kurator-bg",
  "--kurator-main",
  "--kurator-surface",
  "--kurator-border",
  "--kurator-accent",
  "--kurator-muted",
  "--kurator-fg",
  "--kurator-on-accent",
  "--font-sans",
  "--font-kurator-heading",
] as const;

export const CUSTOM_THEME_CHANGED_EVENT = "kurator-custom-theme-changed";

let customThemeFontLink: HTMLLinkElement | null = null;

function notifyCustomThemeChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CUSTOM_THEME_CHANGED_EVENT));
}

/** Logo URL from the active custom theme, when applied to the document. */
export function readActiveCustomThemeLogo(): string | null {
  if (typeof document === "undefined") return null;
  if (document.documentElement.dataset.customTheme !== "active") return null;
  return safeImageSrcUrl(document.documentElement.dataset.customThemeLogo);
}

/** Applies custom theme tokens to the document root, overriding palette CSS vars. */
export function applyCustomThemeToDocument(yamlText: string): boolean {
  if (typeof document === "undefined") return false;
  const doc = parseCustomThemeDocument(yamlText);
  if (!doc) return false;

  const theme = doc.customTheme;
  const c = theme.appearance.colors;
  const f = theme.appearance.font;
  const root = document.documentElement;

  root.dataset.customTheme = "active";
  root.style.setProperty("--kurator-bg", c.background);
  root.style.setProperty("--kurator-main", c.background);
  root.style.setProperty("--kurator-surface", c.surface);
  root.style.setProperty("--kurator-border", c.border);
  root.style.setProperty("--kurator-accent", c.accent);
  root.style.setProperty("--kurator-muted", c.interactive);
  root.style.setProperty("--kurator-fg", c.text);
  root.style.setProperty("--kurator-on-accent", c.secondary);
  const fontStack = `"${f.name}", ${f.fallback}`;
  root.style.setProperty("--font-sans", fontStack);
  root.style.setProperty("--font-kurator-heading", fontStack);
  root.style.fontSize = `${f.size}px`;
  root.style.lineHeight = String(f.lineHeight);

  const logoUrl = safeImageSrcUrl(theme.branding.logo.url);
  if (logoUrl) {
    root.dataset.customThemeLogo = logoUrl;
  } else {
    delete root.dataset.customThemeLogo;
  }

  if (customThemeFontLink) {
    customThemeFontLink.remove();
    customThemeFontLink = null;
  }
  if (f.source === "google") {
    const href = googleFontsHref(theme);
    if (href) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.customThemeFont = "true";
      document.head.appendChild(link);
      customThemeFontLink = link;
    }
  }

  notifyCustomThemeChanged();
  return true;
}

/** Removes custom theme overrides so palette and profile font apply again. */
export function clearCustomThemeFromDocument() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  delete root.dataset.customTheme;
  delete root.dataset.customThemeLogo;
  for (const prop of CUSTOM_THEME_CSS_VARS) {
    root.style.removeProperty(prop);
  }
  root.style.removeProperty("font-size");
  root.style.removeProperty("line-height");
  if (customThemeFontLink) {
    customThemeFontLink.remove();
    customThemeFontLink = null;
  }
  notifyCustomThemeChanged();
}

export function parseCustomThemeDocument(yamlText: string): CustomThemeDocument | null {
  try {
    const doc = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA }) as CustomThemeDocument | undefined;
    if (!doc?.customTheme) return null;
    return normalizeCustomThemeDocument(doc);
  } catch {
    return null;
  }
}

/** Ensures nested objects exist before visual-editor patches mutate the tree. */
export function normalizeCustomThemeDocument(doc: CustomThemeDocument): CustomThemeDocument {
  const t = doc.customTheme;
  t.meta ??= { name: "", description: "", published: false };
  t.branding ??= { logo: { url: "" } };
  t.branding.logo ??= { url: "" };
  if (typeof t.branding.logo.url !== "string") {
    t.branding.logo.url = "";
  }
  t.appearance ??= {
    colors: {
      primary: "#000000",
      secondary: "#FFFFFF",
      background: "#121212",
      surface: "#1E1E1E",
      accent: "#6200EE",
      text: "#FFFFFF",
      border: "#333333",
      interactive: "#BB86FC",
    },
    font: {
      source: "google",
      name: "Inter",
      size: 16,
      lineHeight: 1.5,
      display: "swap",
      fallback: "system-ui",
    },
    icons: { source: "iconify", set: "lucide" },
  };
  t.appearance.colors ??= {
    primary: "#000000",
    secondary: "#FFFFFF",
    background: "#121212",
    surface: "#1E1E1E",
    accent: "#6200EE",
    text: "#FFFFFF",
    border: "#333333",
    interactive: "#BB86FC",
  };
  t.appearance.font ??= {
    source: "google",
    name: "Inter",
    size: 16,
    lineHeight: 1.5,
    display: "swap",
    fallback: "system-ui",
  };
  t.appearance.icons ??= { source: "iconify", set: "lucide" };
  return doc;
}

export function patchCustomThemeYaml(
  yamlText: string,
  patch: (doc: CustomThemeDocument) => void,
): string | null {
  const doc = parseCustomThemeDocument(yamlText);
  if (!doc) return null;
  patch(doc);
  return dumpCustomThemeDocument(doc);
}

export function dumpCustomThemeDocument(doc: CustomThemeDocument): string {
  return yaml.dump(doc, { lineWidth: 100, noRefs: true });
}

export type YamlSyntaxIssue = {
  /** 1-based line number (CodeMirror convention). */
  line: number;
  /** 0-based column within the line. */
  column: number;
  length: number;
  severity: "error" | "warning";
  message: string;
};

const yamlAnchorPattern = /<<:|&[\w-]+|\*[\w-]+/;

/** Client-side YAML syntax and lightweight structural checks for the theme editor. */
export function getYamlSyntaxIssues(text: string): YamlSyntaxIssue[] {
  const issues: YamlSyntaxIssue[] = [];
  if (!text.trim()) {
    return [{ line: 1, column: 0, length: 1, severity: "warning", message: "YAML is empty" }];
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = yamlAnchorPattern.exec(lines[i]);
    if (match && match.index !== undefined) {
      issues.push({
        line: i + 1,
        column: match.index,
        length: match[0].length,
        severity: "error",
        message: "YAML anchors, aliases, and merge keys are not allowed",
      });
    }
  }
  if (issues.length > 0) {
    return issues;
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(text, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    const mark = (err as yaml.YAMLException).mark;
    const message =
      err instanceof Error ? err.message.replace(/^[^:]+:\s*/, "").trim() : "Invalid YAML syntax";
    if (mark && typeof mark.line === "number") {
      issues.push({
        line: mark.line + 1,
        column: mark.column ?? 0,
        length: 1,
        severity: "error",
        message: message || "Invalid YAML syntax",
      });
      return issues;
    }
    return [{ line: 1, column: 0, length: 1, severity: "error", message: message || "Invalid YAML syntax" }];
  }

  if (parsed === null || typeof parsed !== "object") {
    issues.push({
      line: 1,
      column: 0,
      length: 1,
      severity: "error",
      message: "Theme document must be a YAML mapping",
    });
    return issues;
  }

  if (!("customTheme" in (parsed as Record<string, unknown>))) {
    issues.push({
      line: 1,
      column: 0,
      length: 1,
      severity: "warning",
      message: 'Missing top-level "customTheme" key',
    });
  }

  try {
    const docs = yaml.loadAll(text, undefined, { schema: yaml.JSON_SCHEMA });
    if (docs.length > 1) {
      issues.push({
        line: 1,
        column: 0,
        length: 1,
        severity: "error",
        message: "Only one YAML document is allowed",
      });
    }
  } catch {
    /* parse error already reported above */
  }

  return issues;
}

export function themePreviewStyle(theme: CustomThemePayload): Record<string, string | number> {
  const c = theme.appearance.colors;
  const f = theme.appearance.font;
  return {
    ["--preview-bg" as string]: c.background,
    ["--preview-surface" as string]: c.surface,
    ["--preview-border" as string]: c.border,
    ["--preview-accent" as string]: c.accent,
    ["--preview-text" as string]: c.text,
    ["--preview-interactive" as string]: c.interactive,
    ["--preview-primary" as string]: c.primary,
    ["--preview-secondary" as string]: c.secondary,
    fontFamily: `"${f.name}", ${f.fallback}`,
    fontSize: `${f.size}px`,
    lineHeight: f.lineHeight,
    backgroundColor: c.background,
    color: c.text,
  };
}

export function googleFontsHref(theme: CustomThemePayload): string | null {
  if (theme.appearance.font.source !== "google") return null;
  const family = theme.appearance.font.name.trim().replace(/\s+/g, "+");
  if (!family) return null;
  const display = theme.appearance.font.display || "swap";
  return `https://fonts.googleapis.com/css2?family=${family}&display=${display}`;
}

/** Sample line shown under each font name in the editor autocomplete. */
export const GOOGLE_FONT_AUTOCOMPLETE_SAMPLE = "The quick brown fox jumps";

/** Builds a subset Google Fonts stylesheet URL for previewing multiple families in a list. */
export function googleFontsPreviewHref(families: string[]): string | null {
  const cleaned = families.map((f) => f.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const familyParams = cleaned
    .map((name) => `family=${name.replace(/\s+/g, "+")}`)
    .join("&");
  const chars = [...new Set(cleaned.join("") + GOOGLE_FONT_AUTOCOMPLETE_SAMPLE + "0123456789")].sort().join("");
  const text = encodeURIComponent(chars);
  return `https://fonts.googleapis.com/css2?${familyParams}&text=${text}&display=swap`;
}

export function googleFontFamilyCss(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "sans-serif";
  return `"${trimmed.replace(/"/g, '\\"')}", sans-serif`;
}
