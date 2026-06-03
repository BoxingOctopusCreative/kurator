import type { Extensions } from "@tiptap/core";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

import { KuratorEmoji } from "@/lib/tiptapKuratorEmoji";

export type MarkdownRichEditorVariant = "compact" | "full";

export function buildMarkdownRichEditorExtensions(options: {
  variant: MarkdownRichEditorVariant;
  placeholder: string;
  allowImages: boolean;
}): Extensions {
  const { variant, placeholder, allowImages } = options;

  return [
    Markdown.configure({
      markedOptions: { gfm: true, breaks: true },
    }),
    StarterKit.configure({
      heading: variant === "full" ? { levels: [2, 3] } : false,
      bulletList: { HTMLAttributes: { class: "list-disc pl-4" } },
      orderedList: { HTMLAttributes: { class: "list-decimal pl-4" } },
    }),
    LinkExtension.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        class: "text-kurator-accent underline underline-offset-2",
      },
    }),
    KuratorEmoji,
    Placeholder.configure({ placeholder }),
    ...(allowImages
      ? [
          ImageExtension.configure({
            inline: true,
            allowBase64: false,
            HTMLAttributes: {
              class: "my-2 max-h-64 rounded-lg",
            },
          }),
        ]
      : []),
  ];
}
