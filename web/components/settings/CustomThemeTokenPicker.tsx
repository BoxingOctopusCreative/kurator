"use client";

import type { CustomThemeDocument, CustomThemePayload } from "@/lib/customTheme";
import { parseCustomThemeDocument, patchCustomThemeYaml } from "@/lib/customTheme";
import { GoogleFontNameInput } from "@/components/settings/GoogleFontNameInput";

const COLOR_KEYS: (keyof CustomThemePayload["appearance"]["colors"])[] = [
  "primary",
  "secondary",
  "background",
  "surface",
  "accent",
  "text",
  "border",
  "interactive",
];

const ICON_SETS = ["lucide", "mdi", "heroicons", "fa6-solid", "tabler", "ph"];

type Props = {
  yaml: string;
  onApply: (nextYaml: string) => void;
};

export function CustomThemeTokenPicker({ yaml, onApply }: Props) {
  const doc = parseCustomThemeDocument(yaml);
  if (!doc) {
    return (
      <p className="text-sm text-kurator-muted">
        Fix YAML syntax in the YAML editor to use the visual editor.
      </p>
    );
  }
  const theme = doc.customTheme;

  function apply(patch: (d: CustomThemeDocument) => void) {
    const next = patchCustomThemeYaml(yaml, patch);
    if (next) onApply(next);
  }

  return (
    <div className="space-y-4 rounded-xl border border-kurator-border bg-kurator-bg/40 p-4">
      <label className="block text-sm">
        <span className="text-kurator-muted">Theme name</span>
        <input
          className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg"
          value={theme.meta.name}
          onChange={(e) =>
            apply((d) => {
              d.customTheme.meta.name = e.target.value;
            })
          }
        />
      </label>
      <label className="block text-sm">
        <span className="text-kurator-muted">Description</span>
        <textarea
          rows={3}
          className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg"
          value={theme.meta.description}
          onChange={(e) =>
            apply((d) => {
              d.customTheme.meta.description = e.target.value;
            })
          }
        />
      </label>
      <label className="flex cursor-not-allowed items-start gap-3 text-sm opacity-80">
        <input
          type="checkbox"
          checked={theme.meta.published}
          disabled
          readOnly
          className="mt-1 rounded-sm border-kurator-border"
          aria-describedby="custom-theme-published-help"
        />
        <span id="custom-theme-published-help">
          <span className="font-medium text-kurator-fg">Published</span>
          <span className="mt-0.5 block text-xs text-kurator-muted">
            Draft themes stay private. Use the Publish button below when you are ready — the server stamps
            author info and creates an immutable gallery version.
          </span>
        </span>
      </label>
      <div className="space-y-2 border-t border-kurator-border pt-4">
        <h4 className="text-xs font-medium uppercase tracking-wide text-kurator-muted">Branding</h4>
        <label className="block text-sm">
          <span className="text-kurator-muted">Logo URL</span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg"
            value={theme.branding.logo.url}
            onChange={(e) =>
              apply((d) => {
                d.customTheme.branding.logo.url = e.target.value;
              })
            }
          />
          <span className="mt-1 block text-xs text-kurator-muted">
            Must be <span className="font-mono">https://</span> only. Kurator validates and proxies the image when you save.
          </span>
        </label>
        {theme.branding.logo.url.trim().toLowerCase().startsWith("https://") ? (
          <div className="flex items-center gap-3 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- user-provided theme logo preview */}
            <img
              src={theme.branding.logo.url.trim()}
              alt=""
              className="h-10 w-10 rounded object-contain"
              onError={(e) => {
                e.currentTarget.hidden = true;
              }}
            />
            <span className="text-xs text-kurator-muted">Logo preview</span>
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {COLOR_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="color"
              value={theme.appearance.colors[key]}
              onChange={(e) =>
                apply((d) => {
                  d.customTheme.appearance.colors[key] = e.target.value;
                })
              }
              className="h-9 w-12 cursor-pointer rounded border border-kurator-border bg-transparent"
              aria-label={key}
            />
            <span className="capitalize text-kurator-muted">{key}</span>
            <span className="font-mono text-xs text-kurator-fg">{theme.appearance.colors[key]}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-kurator-muted">Font source</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg"
            value={theme.appearance.font.source}
            onChange={(e) =>
              apply((d) => {
                d.customTheme.appearance.font.source = e.target.value as "google" | "typekit";
              })
            }
          >
            <option value="google">Google Fonts</option>
            <option value="typekit">Adobe Typekit</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Font name</span>
          {theme.appearance.font.source === "google" ? (
            <GoogleFontNameInput
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={theme.appearance.font.name}
              onChange={(name) =>
                apply((d) => {
                  d.customTheme.appearance.font.name = name;
                })
              }
            />
          ) : (
            <input
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg"
              value={theme.appearance.font.name}
              onChange={(e) =>
                apply((d) => {
                  d.customTheme.appearance.font.name = e.target.value;
                })
              }
            />
          )}
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Font size</span>
          <input
            type="number"
            min={10}
            max={32}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg"
            value={theme.appearance.font.size}
            onChange={(e) =>
              apply((d) => {
                d.customTheme.appearance.font.size = Number(e.target.value);
              })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Icon set</span>
          <select
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg"
            value={theme.appearance.icons.set}
            onChange={(e) =>
              apply((d) => {
                d.customTheme.appearance.icons.set = e.target.value;
              })
            }
          >
            {ICON_SETS.map((set) => (
              <option key={set} value={set}>
                {set}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
