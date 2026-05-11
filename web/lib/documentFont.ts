import type { FontFamily } from "@/lib/fontFamily";

/** Must match globals.css; inline `--font-sans` so Tailwind layers pick it up everywhere. */
const STACKS: Record<FontFamily, string> = {
  default: `var(--font-cabin), ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"`,
  sans:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
  serif:
    'ui-serif, Georgia, Cambria, "Palatino Linotype", "Book Antiqua", Palatino, "Times New Roman", Times, serif',
  mono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  accessible_opendyslexic:
    '"OpenDyslexic", ui-sans-serif, system-ui, sans-serif',
  accessible_lexend: `var(--font-lexend), ui-sans-serif, system-ui, sans-serif`,
  accessible_atkinson:
    `var(--font-atkinson), ui-sans-serif, system-ui, sans-serif`,
};

function normalizedFontFamily(raw?: string | null): FontFamily {
  const k = (raw ?? "default").trim().toLowerCase();
  if (k in STACKS) return k as FontFamily;
  return "default";
}

/** Applies data-font + --font-sans on <html> so body .font-sans and inherits update immediately. */
export function applyDocumentFont(raw?: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const ff = normalizedFontFamily(raw);

  root.dataset.font = ff;
  const stack = STACKS[ff];
  root.style.setProperty("--font-sans", stack);
}
