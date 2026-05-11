/** Core UI fonts — always selectable. */
export const FONT_FAMILIES_BASE = [
  { value: "default", label: "Kurator (Cabin)" },
  { value: "sans", label: "System sans-serif" },
  { value: "serif", label: "Serif (Georgia / Times stack)" },
  { value: "mono", label: "Monospace / fixed width" },
] as const;

/** Dyslexia- and readability-oriented faces (requires opt-in below). */
export const FONT_FAMILIES_ACCESSIBLE = [
  { value: "accessible_opendyslexic", label: "OpenDyslexic" },
  { value: "accessible_lexend", label: "Lexend (readability-focused)" },
  { value: "accessible_atkinson", label: "Atkinson Hyperlegible (distinct letterforms)" },
] as const;

export type FontFamilyBase = (typeof FONT_FAMILIES_BASE)[number]["value"];
export type FontFamilyAccessible = (typeof FONT_FAMILIES_ACCESSIBLE)[number]["value"];
export type FontFamily = FontFamilyBase | FontFamilyAccessible;

const ALL = [...FONT_FAMILIES_BASE, ...FONT_FAMILIES_ACCESSIBLE];

export function isAccessibleFontFamily(id: string): boolean {
  return (
    id === "accessible_opendyslexic" ||
    id === "accessible_lexend" ||
    id === "accessible_atkinson"
  );
}

export function fontFamilyLabel(id: string): string {
  const row = ALL.find((o) => o.value === id);
  return row?.label ?? id;
}
