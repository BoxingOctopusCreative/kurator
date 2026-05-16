import Emoji, { emojis, shortcodeToEmoji } from "@tiptap/extension-emoji";

/**
 * Emoji support for Tiptap + @tiptap/markdown.
 * Serializes to Unicode in markdown so `MarkdownBody` / react-markdown show real glyphs;
 * falls back to `:name:` when the glyph is unavailable.
 */
export const KuratorEmoji = Emoji.extend({
  renderMarkdown: (node) => {
    const name = node.attrs?.name as string | null | undefined;
    if (!name) return "";
    const item = shortcodeToEmoji(name, emojis);
    return item?.emoji ?? `:${name}:`;
  },
}).configure({
  HTMLAttributes: {
    class:
      "inline select-none align-text-bottom text-[1.15em] leading-none [font-family:emoji,'Apple_Color_Emoji','Segoe_UI_Emoji','Segoe_UI_Symbol','Noto_Color_Emoji']",
  },
});
