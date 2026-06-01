import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOM_THEME_YAML,
  getYamlSyntaxIssues,
  isProRequiredResponse,
  parseCustomThemeDocument,
  patchCustomThemeYaml,
  themePreviewStyle,
  filterGoogleFontNames,
  googleFontsHref,
  googleFontsPreviewHref,
  googleFontFamilyCss,
  GOOGLE_FONT_AUTOCOMPLETE_SAMPLE,
  applyCustomThemeToDocument,
  clearCustomThemeFromDocument,
  readActiveCustomThemeLogo,
} from "./customTheme";

describe("customTheme", () => {
  it("parses default YAML document", () => {
    const doc = parseCustomThemeDocument(DEFAULT_CUSTOM_THEME_YAML);
    expect(doc?.customTheme.meta.name).toBe("my-custom-theme");
    expect(doc?.customTheme.appearance.icons.set).toBe("lucide");
  });

  it("builds preview CSS variables from theme", () => {
    const doc = parseCustomThemeDocument(DEFAULT_CUSTOM_THEME_YAML);
    expect(doc).not.toBeNull();
    const style = themePreviewStyle(doc!.customTheme);
    expect(style.backgroundColor).toBe("#121212");
    expect(style.color).toBe("#FFFFFF");
  });

  it("detects pro_required 403 responses", () => {
    expect(isProRequiredResponse({ status: 403 } as Response, { error: "pro_required" })).toBe(true);
    expect(isProRequiredResponse({ status: 403 } as Response, { error: "other" })).toBe(false);
  });

  it("reports valid YAML syntax for default theme", () => {
    expect(getYamlSyntaxIssues(DEFAULT_CUSTOM_THEME_YAML)).toEqual([]);
  });

  it("reports YAML parse errors with line numbers", () => {
    const bad = DEFAULT_CUSTOM_THEME_YAML.replace('name: "my-custom-theme"', 'name: "my-custom-theme"');
    const broken = bad.replace("description:", "description\n  - bad");
    const issues = getYamlSyntaxIssues(broken);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
    expect(issues[0]?.line).toBeGreaterThan(0);
  });

  it("rejects YAML anchors", () => {
    const issues = getYamlSyntaxIssues("anchor: &x {}\n" + DEFAULT_CUSTOM_THEME_YAML);
    expect(issues.some((i) => i.message.includes("anchors"))).toBe(true);
  });

  it("builds Google Fonts CSS URL with spaced family names", () => {
    const doc = parseCustomThemeDocument(DEFAULT_CUSTOM_THEME_YAML);
    expect(doc).not.toBeNull();
    const theme = { ...doc!.customTheme };
    theme.appearance.font.name = "Open Sans";
    expect(googleFontsHref(theme)).toBe("https://fonts.googleapis.com/css2?family=Open+Sans&display=swap");
  });

  it("builds subset preview URL for autocomplete font samples", () => {
    const href = googleFontsPreviewHref(["Inter", "Open Sans"]);
    expect(href).toContain("family=Inter");
    expect(href).toContain("family=Open+Sans");
    expect(href).toContain("text=");
    expect(href).toContain("display=swap");
    expect(googleFontsPreviewHref([])).toBeNull();
  });

  it("escapes font names for CSS font-family", () => {
    expect(googleFontFamilyCss("Inter")).toBe('"Inter", sans-serif');
    expect(googleFontFamilyCss('A "quoted" Font')).toContain('sans-serif');
  });

  it("defines autocomplete sample text", () => {
    expect(GOOGLE_FONT_AUTOCOMPLETE_SAMPLE.length).toBeGreaterThan(10);
  });

  it("filters Google Font names for autocomplete", () => {
    const families = ["Inter", "Roboto", "Roboto Slab", "Open Sans"];
    expect(filterGoogleFontNames(families, "rob")).toEqual(["Roboto", "Roboto Slab"]);
    expect(filterGoogleFontNames(families, "")).toEqual(families);
    expect(filterGoogleFontNames(families, "zzz")).toEqual([]);
  });

  it("applies and clears custom theme CSS variables on document", () => {
    document.documentElement.style.removeProperty("--kurator-bg");
    delete document.documentElement.dataset.customTheme;
    delete document.documentElement.dataset.customThemeLogo;
    const applied = applyCustomThemeToDocument(DEFAULT_CUSTOM_THEME_YAML);
    expect(applied).toBe(true);
    expect(document.documentElement.dataset.customTheme).toBe("active");
    expect(document.documentElement.style.getPropertyValue("--kurator-bg")).toBe("#121212");
    expect(document.documentElement.style.getPropertyValue("--font-kurator-heading")).toContain("Inter");
    expect(readActiveCustomThemeLogo()).toBe(
      "https://assets.kuratorapp.cc/brand/PNG/kurator_favicon-white.png",
    );
    clearCustomThemeFromDocument();
    expect(document.documentElement.dataset.customTheme).toBeUndefined();
    expect(document.documentElement.dataset.customThemeLogo).toBeUndefined();
    expect(readActiveCustomThemeLogo()).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--kurator-bg")).toBe("");
  });

  it("patches logo URL into YAML from the visual editor flow", () => {
    const yamlMissingBranding = `---
customTheme:
  schemaVersion: "v1"
  meta:
    name: "test"
    description: ""
    published: false
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
    const next = patchCustomThemeYaml(yamlMissingBranding, (doc) => {
      doc.customTheme.branding.logo.url = "https://example.com/logo.png";
    });
    expect(next).toContain("https://example.com/logo.png");
    expect(parseCustomThemeDocument(next ?? "")?.customTheme.branding.logo.url).toBe(
      "https://example.com/logo.png",
    );
  });
});
