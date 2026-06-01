"use client";

import { Icon } from "@iconify/react";
import { useEffect } from "react";
import {
  googleFontsHref,
  parseCustomThemeDocument,
  themePreviewStyle,
  type CustomThemePayload,
} from "@/lib/customTheme";

type Props = {
  yaml: string;
};

function FontLoader({ theme }: { theme: CustomThemePayload }) {
  useEffect(() => {
    if (theme.appearance.font.source === "google") {
      const href = googleFontsHref(theme);
      if (!href) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      return () => {
        document.head.removeChild(link);
      };
    }
    if (theme.appearance.font.source === "typekit" && theme.appearance.font.kitId) {
      const kitId = theme.appearance.font.kitId.trim();
      const script = document.createElement("script");
      script.src = `https://use.typekit.net/${kitId}.js`;
      script.async = true;
      document.head.appendChild(script);
      return () => {
        document.head.removeChild(script);
      };
    }
  }, [theme]);

  return null;
}

export function CustomThemePreview({ yaml }: Props) {
  const doc = parseCustomThemeDocument(yaml);
  if (!doc) {
    return (
      <div className="rounded-xl border border-dashed border-kurator-border p-6 text-sm text-kurator-muted">
        Preview unavailable until YAML syntax is valid.
      </div>
    );
  }

  const theme = doc.customTheme;
  const style = themePreviewStyle(theme);
  const iconName = `${theme.appearance.icons.set}:heart`;

  return (
    <div className="space-y-3">
      <FontLoader theme={theme} />
      <div
        className="overflow-hidden rounded-xl border shadow-surface"
        style={{ ...style, borderColor: theme.appearance.colors.border }}
      >
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{
            backgroundColor: theme.appearance.colors.surface,
            borderColor: theme.appearance.colors.border,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme.branding.logo.url}
            alt=""
            className="h-8 w-8 rounded object-contain"
          />
          <div>
            <p className="font-semibold" style={{ color: theme.appearance.colors.text }}>
              {theme.meta.name}
            </p>
            <p className="text-xs opacity-75">{theme.meta.description || "Theme preview"}</p>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{
                backgroundColor: theme.appearance.colors.accent,
                color: theme.appearance.colors.secondary,
              }}
            >
              Primary action
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{
                borderColor: theme.appearance.colors.border,
                color: theme.appearance.colors.interactive,
              }}
            >
              Secondary
            </button>
          </div>
          <div
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{
              backgroundColor: theme.appearance.colors.surface,
              borderColor: theme.appearance.colors.border,
            }}
          >
            <Icon icon={iconName} width={18} height={18} style={{ color: theme.appearance.colors.interactive }} />
            <span>List item with Iconify ({theme.appearance.icons.set})</span>
          </div>
          <input
            readOnly
            value="Sample input"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: theme.appearance.colors.background,
              borderColor: theme.appearance.colors.border,
              color: theme.appearance.colors.text,
            }}
          />
        </div>
      </div>
    </div>
  );
}
