/** Base palettes (always available). */
export const COLOR_SCHEMES_BASE = [
  { value: "default", label: "Kurator (default)" },
  { value: "darcula", label: "Darcula" },
  { value: "catppuccin", label: "Catppuccin" },
  { value: "solarized", label: "Solarized" },
  { value: "outrun", label: "Outrun (80s retrowave)" },
] as const;

/** Shown only when accessible colour schemes are enabled in profile. */
export const COLOR_SCHEMES_ACCESSIBLE = [
  { value: "accessible_okabe", label: "Safe colours (Okabe–Ito style)" },
  { value: "accessible_high_contrast", label: "High contrast" },
] as const;

export type ColorSchemeBase = (typeof COLOR_SCHEMES_BASE)[number]["value"];
export type ColorSchemeAccessible = (typeof COLOR_SCHEMES_ACCESSIBLE)[number]["value"];
export type ColorScheme = ColorSchemeBase | ColorSchemeAccessible;

export function isAccessibleColorScheme(id: string): boolean {
  return id === "accessible_okabe" || id === "accessible_high_contrast";
}

const ALL_SCHEMES = [...COLOR_SCHEMES_BASE, ...COLOR_SCHEMES_ACCESSIBLE];

export function colorSchemeLabel(id: string): string {
  const row = ALL_SCHEMES.find((o) => o.value === id);
  return row?.label ?? id;
}
