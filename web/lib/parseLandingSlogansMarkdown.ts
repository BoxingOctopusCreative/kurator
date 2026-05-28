/**
 * Extracts rotating slogan strings from `content/landing-slogans.md`.
 * Each markdown list item (`-`, `*`, `+`, or `1.`) becomes one slogan.
 */
export function parseLandingSlogansFromMarkdown(markdown: string): string[] {
  const slogans: string[] = [];

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      const text = bullet[1].trim();
      if (text) {
        slogans.push(text);
      }
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const text = ordered[1].trim();
      if (text) {
        slogans.push(text);
      }
    }
  }

  return slogans;
}
