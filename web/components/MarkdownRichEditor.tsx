"use client";

import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  RemoveFormatting,
  Smile,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { uploadCoverImage } from "@/lib/api";
import { KuratorEmoji } from "@/lib/tiptapKuratorEmoji";
import { safeImageSrcUrl } from "@/lib/safeUrl";

export type MarkdownRichEditorVariant = "compact" | "full";

export type MarkdownRichEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  variant?: MarkdownRichEditorVariant;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  /** Increment when the shell should receive focus (e.g. entering inline edit mode). */
  focusTick?: number;
  /** When focus leaves the toolbar + editor region (e.g. save-on-blur). */
  onBlurShell?: () => void;
  onSaveChord?: () => void;
  onCancelChord?: () => void;
  /** Upload images to storage and embed as markdown images (requires sign-in). */
  allowImages?: boolean;
};

const proseMirrorClass =
  "min-h-[7rem] max-w-none px-3 py-2 text-sm leading-relaxed text-kurator-fg outline-hidden focus:outline-hidden " +
  "prose prose-sm max-w-none prose-p:my-1 prose-p:text-kurator-fg prose-li:text-kurator-fg " +
  "prose-headings:my-2 prose-headings:text-kurator-fg prose-strong:text-kurator-fg " +
  "prose-a:text-kurator-accent prose-code:text-kurator-fg " +
  "prose-img:my-2 prose-img:max-h-64 prose-img:rounded-lg";

const proseMirrorClassCompact =
  "min-h-[4.5rem] max-w-none px-3 py-2 text-sm leading-relaxed text-kurator-fg outline-hidden focus:outline-hidden " +
  "prose prose-sm max-w-none prose-p:my-1 prose-p:text-kurator-fg prose-li:text-kurator-fg " +
  "prose-headings:my-2 prose-headings:text-kurator-fg prose-strong:text-kurator-fg " +
  "prose-a:text-kurator-accent prose-code:text-kurator-fg " +
  "prose-img:my-2 prose-img:max-h-64 prose-img:rounded-lg";

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-40 ${
        active ? "bg-kurator-border/50" : ""
      }`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  editor,
  variant,
  disabled,
  allowImages,
  onPickImage,
  imageUploading,
}: {
  editor: Editor;
  variant: MarkdownRichEditorVariant;
  disabled: boolean;
  allowImages: boolean;
  onPickImage: () => void;
  imageUploading: boolean;
}) {
  const canHeading = variant === "full";
  return (
    <div
      className="flex flex-wrap gap-0.5 border-b border-kurator-border bg-kurator-bg/60 px-1 py-1"
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolbarButton
        title="Bold (⌘B)"
        disabled={disabled}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        title="Italic (⌘I)"
        disabled={disabled}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      {canHeading ? (
        <>
          <ToolbarButton
            title="Heading 2"
            disabled={disabled}
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="h-4 w-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            title="Heading 3"
            disabled={disabled}
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 className="h-4 w-4" aria-hidden />
          </ToolbarButton>
        </>
      ) : null}
      <ToolbarButton
        title="Bullet list"
        disabled={disabled}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        disabled={disabled}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        title="Emoji: use your device’s emoji keyboard (Win+. or Ctrl+⌘+Space on Mac), paste, or type a supported :shortcode: between colons"
        disabled={disabled}
        onClick={() => editor.chain().focus().run()}
      >
        <Smile className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        title="Link"
        disabled={disabled}
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const next = window.prompt("Link URL", prev ?? "https://");
          if (next === null) return;
          const t = next.trim();
          if (t === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: t }).run();
        }}
      >
        <LinkIcon className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      {allowImages ? (
        <ToolbarButton
          title="Insert image (upload)"
          disabled={disabled || imageUploading}
          onClick={onPickImage}
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
        </ToolbarButton>
      ) : null}
      <ToolbarButton
        title="Clear formatting"
        disabled={disabled}
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="h-4 w-4" aria-hidden />
      </ToolbarButton>
    </div>
  );
}

export function MarkdownRichEditor({
  value,
  onChange,
  variant = "full",
  placeholder = "Write something…",
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
  focusTick = 0,
  onBlurShell,
  onSaveChord,
  onCancelChord,
  allowImages = false,
}: MarkdownRichEditorProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const onChangeRef = useRef(onChange);
  const onSaveChordRef = useRef(onSaveChord);
  const onCancelChordRef = useRef(onCancelChord);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onSaveChordRef.current = onSaveChord;
  }, [onSaveChord]);
  useEffect(() => {
    onCancelChordRef.current = onCancelChord;
  }, [onCancelChord]);

  const extensions = useMemo(() => {
    const base = [
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
    ];
    if (allowImages) {
      base.push(
        ImageExtension.configure({
          inline: true,
          allowBase64: false,
          HTMLAttributes: {
            class: "my-2 max-h-64 rounded-lg",
          },
        }),
      );
    }
    return base;
  }, [variant, placeholder, allowImages]);

  const onPickImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: value,
      contentType: "markdown",
      editable: !disabled,
      editorProps: {
        attributes: {
          class: variant === "compact" ? proseMirrorClassCompact : proseMirrorClass,
          ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        },
        handleKeyDown: (_view, event) => {
          if (event.key === "Escape") {
            if (onCancelChordRef.current) {
              onCancelChordRef.current();
              return true;
            }
            return false;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            if (onSaveChordRef.current) {
              event.preventDefault();
              onSaveChordRef.current();
              return true;
            }
            return false;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        const md = ed.getMarkdown();
        lastEmitted.current = md;
        onChangeRef.current(md);
      },
    },
    [extensions],
  );

  const insertUploadedImage = useCallback(
    async (file: File) => {
      if (!editor || disabled) return;
      setImageUploading(true);
      try {
        const url = await uploadCoverImage(file);
        const safe = safeImageSrcUrl(url);
        if (!safe) {
          throw new Error("Invalid image URL from server.");
        }
        const alt = file.name.replace(/\.[^.]+$/, "") || "image";
        editor.chain().focus().setImage({ src: safe, alt }).run();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Could not upload image.");
      } finally {
        setImageUploading(false);
      }
    },
    [editor, disabled],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value || "", { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor || !focusTick) return;
    requestAnimationFrame(() => {
      editor.commands.focus("end");
    });
  }, [editor, focusTick]);

  if (!editor) {
    return (
      <div
        className={`animate-pulse rounded-lg border border-kurator-border bg-kurator-bg/50 ${className}`.trim()}
        aria-hidden
      >
        <div className="h-24" />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`overflow-hidden rounded-lg border border-kurator-border bg-kurator-bg ring-kurator-accent focus-within:ring-2 ${className}`.trim()}
      onBlur={(e) => {
        if (!onBlurShell) return;
        if (!shellRef.current?.contains(e.relatedTarget as Node)) {
          onBlurShell();
        }
      }}
    >
      <EditorToolbar
        editor={editor}
        variant={variant}
        disabled={disabled}
        allowImages={allowImages}
        onPickImage={onPickImage}
        imageUploading={imageUploading}
      />
      {allowImages ? (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void insertUploadedImage(file);
          }}
        />
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
