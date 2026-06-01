"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { useAuth } from "@/components/AuthProvider";
import { CustomThemePreview } from "@/components/settings/CustomThemePreview";
import { CustomThemeTokenPicker } from "@/components/settings/CustomThemeTokenPicker";
import { CustomThemeUpsell } from "@/components/settings/CustomThemeUpsell";
import { fetchMe, type AuthUser } from "@/lib/auth";
import { isProPlan } from "@/lib/billing";
import {
  DEFAULT_CUSTOM_THEME_YAML,
  clearCustomThemeFromDocument,
  deleteCreatedCustomTheme,
  fetchMyCustomTheme,
  ProRequiredError,
  publishCustomTheme,
  resetCustomTheme,
  saveCustomThemeYaml,
  unpublishCustomTheme,
  type CustomThemeFieldError,
} from "@/lib/customTheme";

const CustomThemeYamlEditor = dynamic(
  () =>
    import("@/components/settings/CustomThemeYamlEditor").then((m) => ({
      default: m.CustomThemeYamlEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-kurator-border bg-kurator-bg px-4 py-8 text-sm text-kurator-muted">
        Loading YAML editor…
      </div>
    ),
  },
);

export function CustomThemeSettingsClient() {
  const router = useRouter();
  const { user: sessionUser, refresh } = useAuth();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [yaml, setYaml] = useState(DEFAULT_CUSTOM_THEME_YAML);
  const [themeId, setThemeId] = useState<string | undefined>(undefined);
  const [publishedVersionCount, setPublishedVersionCount] = useState(0);
  const [schemaErrors, setSchemaErrors] = useState<CustomThemeFieldError[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [proBlocked, setProBlocked] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await fetchMe();
      if (!me) {
        setUser(null);
        return;
      }
      setUser(me);
      if (!isProPlan(me.plan)) {
        setProBlocked(true);
        return;
      }
      const theme = await fetchMyCustomTheme();
      setYaml(theme.yaml);
      setThemeId(theme.theme_id);
      setPublishedVersionCount(theme.published_version_count ?? 0);
      setProBlocked(false);
    } catch (err) {
      if (err instanceof ProRequiredError) {
        setProBlocked(true);
        setUser(await fetchMe().catch(() => null));
        return;
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user === null) {
      router.replace("/login?next=/settings/theme");
    }
  }, [user, router]);

  async function onSave() {
    setBusy(true);
    setMessage(null);
    setSchemaErrors([]);
    try {
      const result = await saveCustomThemeYaml(yaml);
      if (!result.valid && result.errors?.length) {
        setSchemaErrors(result.errors);
        setMessage({ tone: "bad", text: "Fix the validation errors below and try again." });
        return;
      }
      if (result.yaml) setYaml(result.yaml);
      setMessage({ tone: "ok", text: "Theme saved." });
    } catch (err) {
      setMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not save theme",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    setBusy(true);
    setMessage(null);
    setSchemaErrors([]);
    try {
      await resetCustomTheme();
      setYaml(DEFAULT_CUSTOM_THEME_YAML);
      setThemeId(undefined);
      setPublishedVersionCount(0);
      clearCustomThemeFromDocument();
      await refresh();
      setMessage({ tone: "ok", text: "Reset to Kurator defaults." });
    } catch (err) {
      setMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not reset theme",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    setBusy(true);
    setMessage(null);
    try {
      await onSave();
      await publishCustomTheme();
      setPublishedVersionCount((n) => n + 1);
      setMessage({ tone: "ok", text: "Theme published to the gallery." });
    } catch (err) {
      setMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not publish theme",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onUnpublish() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await unpublishCustomTheme();
      setPublishedVersionCount(0);
      setConfirmUnpublish(false);
      if (result.active_cleared) {
        clearCustomThemeFromDocument();
        await refresh();
      }
      setMessage({
        tone: "ok",
        text: result.theme_name
          ? `“${result.theme_name}” was removed from the marketplace.`
          : "Theme removed from the marketplace.",
      });
    } catch (err) {
      setMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not unpublish theme",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    setMessage(null);
    try {
      await deleteCreatedCustomTheme();
      setYaml(DEFAULT_CUSTOM_THEME_YAML);
      setThemeId(undefined);
      setPublishedVersionCount(0);
      setConfirmDelete(false);
      clearCustomThemeFromDocument();
      await refresh();
      setMessage({ tone: "ok", text: "Theme deleted." });
    } catch (err) {
      setMessage({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not delete theme",
      });
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined || user === null) {
    return (
      <div className="mx-auto max-w-5xl text-sm text-kurator-muted">
        {user === undefined ? "Loading…" : "Redirecting to login…"}
      </div>
    );
  }

  const showUpsell = proBlocked || !isProPlan(user.plan ?? sessionUser?.plan);
  const hasSavedTheme = Boolean(themeId);
  const isPublished = publishedVersionCount > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold text-kurator-fg">Custom Theme</h1>
          <p className="mt-1 text-sm text-kurator-muted">
            Design a YAML theme with live preview. Kurator Pro required to save and publish.
          </p>
        </div>
      </PageHeroUnsplash>

      {showUpsell ? (
        <CustomThemeUpsell />
      ) : (
        <div className="space-y-6 rounded-xl border border-kurator-border bg-kurator-surface p-6 sm:p-8 shadow-surface">
          <div className="space-y-3">
            <h2 className="kurator-panel-title text-kurator-fg">Live preview</h2>
            <CustomThemePreview yaml={yaml} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="space-y-3">
              <h2 className="kurator-panel-title text-kurator-fg">Visual Editor</h2>
              <CustomThemeTokenPicker yaml={yaml} onApply={setYaml} />
            </div>
            <CustomThemeYamlEditor
              value={yaml}
              onChange={setYaml}
              schemaErrors={schemaErrors}
              minEditorHeight="400px"
            />
          </div>

          {message ? (
            <p className={`text-sm ${message.tone === "ok" ? "text-emerald-400" : "text-red-400"}`} role="status">
              {message.text}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 border-t border-kurator-border pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSave()}
              className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Working…" : "Save theme"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onPublish()}
              className="rounded-lg border border-kurator-border px-4 py-2 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-50"
            >
              Publish
            </button>
            {isPublished ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmUnpublish(true)}
                className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
              >
                Unpublish
              </button>
            ) : null}
            {hasSavedTheme && !isPublished ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                Delete theme
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || isPublished}
              onClick={() => void onReset()}
              className="rounded-lg border border-kurator-border px-4 py-2 text-sm text-kurator-muted hover:bg-kurator-border/40 hover:text-kurator-fg disabled:opacity-50"
              title={isPublished ? "Unpublish before resetting to defaults" : undefined}
            >
              Reset to defaults
            </button>
          </div>

          {confirmUnpublish ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-kurator-fg">
              <p>
                Unpublish removes this theme from the marketplace for all users. Anyone actively using
                it will switch back to the Kurator default theme.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onUnpublish()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Unpublish theme
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmUnpublish(false)}
                  className="rounded-lg border border-kurator-border px-3 py-1.5 text-sm text-kurator-muted hover:bg-kurator-border/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {confirmDelete ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-kurator-fg">
              <p>
                Delete permanently removes your saved theme draft. This cannot be undone.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Delete theme
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-kurator-border px-3 py-1.5 text-sm text-kurator-muted hover:bg-kurator-border/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <p className="text-sm text-kurator-muted">
        Browse themes from other Kurator Pro users in the{" "}
        <Link href="/settings/theme/marketplace" className="text-kurator-accent hover:underline">
          Theme Marketplace
        </Link>
        .
      </p>

      <Link href="/settings/app" className="inline-block text-sm text-kurator-accent hover:underline">
        Back to App Settings
      </Link>
    </div>
  );
}
