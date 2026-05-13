"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeroUnsplash } from "@/components/PageHeroUnsplash";
import { useAuth } from "@/components/AuthProvider";
import { ColorSchemeSelect } from "@/components/ColorSchemeSelect";
import { WishlistSettingsModal } from "@/components/WishlistSettingsModal";
import { FontFamilySelect } from "@/components/FontFamilySelect";
import { ThemePreferenceSelect } from "@/components/ThemePreferenceSelect";
import {
  changePasswordSignedIn,
  disable2FA,
  enable2FA,
  fetchMe,
  logout,
  patchProfile,
  requestSignedInPasswordVerificationCode,
  setup2FA,
  type AuthUser,
  type TwoFASetup,
} from "@/lib/auth";

export function AppSettingsClient() {
  const router = useRouter();
  const { refresh: refreshAuth, user: sessionUser } = useAuth();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accessiblePalettesBusy, setAccessiblePalettesBusy] = useState(false);
  const [accessibleFontsBusy, setAccessibleFontsBusy] = useState(false);

  const [twoFASetup, setTwoFASetup] = useState<TwoFASetup | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");

  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdTotp, setPwdTotp] = useState("");
  const [pwdEmailCode, setPwdEmailCode] = useState("");
  const [pwdEmailSent, setPwdEmailSent] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdFeedback, setPwdFeedback] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pwdTotpModalOpen, setPwdTotpModalOpen] = useState(false);
  const [pwdTotpError, setPwdTotpError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const u = await fetchMe();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user === null) {
      router.replace("/login?next=/settings/app");
    }
  }, [user, router]);

  useEffect(() => {
    setPwdEmailSent(false);
    setPwdEmailCode("");
    setPwdFeedback(null);
    setPwdTotpModalOpen(false);
    setPwdTotp("");
    setPwdTotpError(null);
  }, [user?.two_factor_enabled]);

  async function onSendPasswordEmailCode() {
    setPwdFeedback(null);
    setPwdBusy(true);
    try {
      await requestSignedInPasswordVerificationCode();
      setPwdEmailSent(true);
      setPwdFeedback({ tone: "ok", text: "If email delivery is configured, you should receive a 6-digit code shortly." });
    } catch (err) {
      setPwdFeedback({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not send verification code.",
      });
    } finally {
      setPwdBusy(false);
    }
  }

  function openPwdTotpModal() {
    setPwdTotp("");
    setPwdTotpError(null);
    setPwdTotpModalOpen(true);
  }

  async function finalizePasswordChangeAfterSuccess() {
    setPwdTotpModalOpen(false);
    setPwdNew("");
    setPwdConfirm("");
    setPwdTotp("");
    setPwdEmailCode("");
    setPwdEmailSent(false);
    setPwdTotpError(null);
    await logout();
    await refreshAuth();
    router.push("/login?reset=1");
    router.refresh();
  }

  function handlePasswordFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwdFeedback(null);
    if (!user) {
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdFeedback({ tone: "bad", text: "New password and confirmation do not match." });
      return;
    }
    if (user.two_factor_enabled) {
      openPwdTotpModal();
      return;
    }
    if (!pwdEmailSent) {
      setPwdFeedback({ tone: "bad", text: "Request a verification code from your email first." });
      return;
    }
    void submitPasswordChangeWithEmailCode();
  }

  async function submitPasswordChangeWithEmailCode() {
    setPwdBusy(true);
    try {
      await changePasswordSignedIn({ password: pwdNew, emailCode: pwdEmailCode });
      await finalizePasswordChangeAfterSuccess();
    } catch (err) {
      setPwdFeedback({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not update password.",
      });
    } finally {
      setPwdBusy(false);
    }
  }

  async function handleConfirmPasswordWithTotp(ev: React.FormEvent) {
    ev.preventDefault();
    setPwdTotpError(null);
    setPwdBusy(true);
    try {
      await changePasswordSignedIn({ password: pwdNew, totpCode: pwdTotp });
      await finalizePasswordChangeAfterSuccess();
    } catch (err) {
      setPwdTotpError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setPwdBusy(false);
    }
  }

  async function onBegin2FA() {
    setMessage(null);
    setBusy(true);
    try {
      const s = await setup2FA();
      setTwoFASetup(s);
      setEnableCode("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start 2FA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm2FA(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const u = await enable2FA(enableCode.replace(/\s/g, ""));
      setUser(u);
      setTwoFASetup(null);
      setEnableCode("");
      await refreshAuth();
      setMessage("Two-factor authentication is on.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable2FA(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const u = await disable2FA(disablePassword);
      setUser(u);
      setDisablePassword("");
      await refreshAuth();
      setMessage("Two-factor authentication is off.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not disable 2FA.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    await refreshAuth();
    router.push("/");
    router.refresh();
  }

  if (user === undefined || user === null) {
    return (
      <div className="mx-auto max-w-3xl text-sm text-kurator-muted">
        {user === undefined ? "Loading…" : "Redirecting to login…"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeroUnsplash>
        <div>
          <h1 className="text-2xl font-semibold text-kurator-fg">App Settings</h1>
          <p className="mt-1 text-sm text-kurator-muted">Signed in as {user.email}</p>
        </div>
      </PageHeroUnsplash>

      <div className="space-y-10 rounded-xl border border-kurator-border bg-kurator-surface p-6 sm:p-8 shadow-surface">
      <section className="space-y-3">
        <h2 className="kurator-panel-title text-kurator-fg">Change Password</h2>
        <p className="text-sm text-kurator-muted">
          Your new password takes effect immediately. All sessions are signed out, including this browser — you will log in
          again with the new password.
        </p>
        {user.two_factor_enabled ? (
          <p className="text-sm text-kurator-muted">
            After you choose a new password, you&apos;ll be asked for a code from your authenticator app to confirm.
          </p>
        ) : (
          <p className="text-sm text-kurator-muted">
            We email a one-time code to <span className="text-kurator-fg">{user.email}</span> to confirm the change.
          </p>
        )}
        <form onSubmit={handlePasswordFormSubmit} className="space-y-3">
          {!user.two_factor_enabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pwdBusy}
                onClick={() => void onSendPasswordEmailCode()}
                className="rounded-lg border border-kurator-border px-4 py-2 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-50"
              >
                {pwdEmailSent ? "Resend email code" : "Email me a verification code"}
              </button>
              {pwdEmailSent ? (
                <span className="text-xs text-kurator-muted">Code expires in about 15 minutes.</span>
              ) : null}
            </div>
          ) : null}
          <label className="block text-sm">
            <span className="text-kurator-muted">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={pwdNew}
              onChange={(e) => setPwdNew(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={pwdConfirm}
              onChange={(e) => setPwdConfirm(e.target.value)}
            />
          </label>
          {!user.two_factor_enabled ? (
            <label className="block text-sm">
              <span className="text-kurator-muted">Email verification code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required={pwdEmailSent}
                disabled={!pwdEmailSent}
                placeholder={pwdEmailSent ? "6-digit code" : "Request a code first"}
                className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                value={pwdEmailCode}
                onChange={(e) => setPwdEmailCode(e.target.value)}
              />
            </label>
          ) : null}
          {pwdFeedback ? (
            <p className={`text-sm ${pwdFeedback.tone === "ok" ? "text-emerald-400" : "text-red-400"}`} role="status">
              {pwdFeedback.text}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={
              pwdBusy || pwdTotpModalOpen || (!user.two_factor_enabled && !pwdEmailSent)
            }
            className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {user.two_factor_enabled
              ? "Continue with Authenticator"
              : pwdBusy
                ? "Updating…"
                : "Update Password"}
          </button>
        </form>

        <WishlistSettingsModal
          open={pwdTotpModalOpen}
          onOpenChange={(open) => {
            setPwdTotpModalOpen(open);
            if (!open) {
              setPwdTotp("");
              setPwdTotpError(null);
            }
          }}
          title="Confirm with Authenticator"
          titleId="password-change-totp-modal-title"
        >
          <p className="text-sm text-kurator-muted">
            Enter the current code from your authenticator app to apply your new password. This will sign you out everywhere.
          </p>
          <form onSubmit={(ev) => void handleConfirmPasswordWithTotp(ev)} className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="text-kurator-muted">Authenticator Code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                value={pwdTotp}
                onChange={(e) => setPwdTotp(e.target.value)}
              />
            </label>
            {pwdTotpError ? (
              <p className="text-sm text-red-400" role="alert">
                {pwdTotpError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                disabled={pwdBusy}
                className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
              >
                {pwdBusy ? "Updating…" : "Confirm Password Change"}
              </button>
              <button
                type="button"
                disabled={pwdBusy}
                className="rounded-lg border border-kurator-border px-4 py-2 text-sm text-kurator-muted hover:bg-kurator-border/40 hover:text-kurator-fg disabled:opacity-50"
                onClick={() => {
                  setPwdTotpModalOpen(false);
                  setPwdTotp("");
                  setPwdTotpError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </WishlistSettingsModal>
        <p className="text-xs text-kurator-muted">
          Signed out and need access? Use{" "}
          <Link href="/forgot-password" className="text-kurator-accent hover:underline">
            Forgot Password
          </Link>{" "}
          from the login page.
        </p>
      </section>

      <section className="space-y-3 border-t border-kurator-border pt-8">
        <h2 className="kurator-panel-title text-kurator-fg">Appearance</h2>
        <p className="text-sm text-kurator-muted">
          Choose light or dark mode, a typeface, and a colour palette for accents and surfaces.
        </p>
        <label className="block text-sm">
          <span className="text-kurator-muted">Theme</span>
          <ThemePreferenceSelect
            id="app-settings-theme"
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Font</span>
          <FontFamilySelect
            id="app-settings-font"
            accessibleFontsEnabled={sessionUser?.accessible_fonts_enabled ?? false}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 rounded-sm border-kurator-border"
            checked={sessionUser?.accessible_fonts_enabled ?? false}
            disabled={!sessionUser || accessibleFontsBusy}
            onChange={async (e) => {
              if (!sessionUser) return;
              setAccessibleFontsBusy(true);
              try {
                await patchProfile({ accessible_fonts_enabled: e.target.checked });
                await refreshAuth();
                await load();
              } finally {
                setAccessibleFontsBusy(false);
              }
            }}
          />
          <span>
            <span className="font-medium text-kurator-fg">Show readable / dyslexia-friendly fonts</span>
            <span className="mt-0.5 block text-xs text-kurator-muted">
              Adds OpenDyslexic (bundled via Fontsource), Lexend, and Atkinson Hyperlegible. Turn this on first, then choose one in the Font list.
            </span>
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-kurator-muted">Colour scheme</span>
          <ColorSchemeSelect
            id="app-settings-color-scheme"
            accessibleExtrasEnabled={sessionUser?.accessible_color_schemes_enabled ?? false}
            className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 rounded-sm border-kurator-border"
            checked={sessionUser?.accessible_color_schemes_enabled ?? false}
            disabled={!sessionUser || accessiblePalettesBusy}
            onChange={async (e) => {
              if (!sessionUser) return;
              setAccessiblePalettesBusy(true);
              try {
                await patchProfile({ accessible_color_schemes_enabled: e.target.checked });
                await refreshAuth();
                await load();
              } finally {
                setAccessiblePalettesBusy(false);
              }
            }}
          />
          <span>
            <span className="font-medium text-kurator-fg">Show accessible colour schemes</span>
            <span className="mt-0.5 block text-xs text-kurator-muted">
              Adds palettes designed for colour-vision accessibility (e.g. Okabe–Ito inspired and high contrast). Turn this on before choosing those options in the list above.
            </span>
          </span>
        </label>
      </section>

      <section className="space-y-4 border-t border-kurator-border pt-8">
        <h2 className="kurator-panel-title text-kurator-fg">Two-Factor Authentication</h2>
        <p className="text-sm text-kurator-muted">
          Add a TOTP app (1Password, Google Authenticator, etc.). You will be asked for a code when
          you log in.
        </p>
        {user.two_factor_enabled ? (
          <form onSubmit={onDisable2FA} className="space-y-3 rounded-lg border border-kurator-border bg-kurator-bg/40 p-4">
            <p className="text-sm text-kurator-accent">2FA is enabled for this account.</p>
            <label className="block text-sm">
              <span className="text-kurator-muted">Current password</span>
              <input
                type="password"
                required
                className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-red-500/50 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-950/50 disabled:opacity-50"
            >
              Turn Off 2FA
            </button>
          </form>
        ) : twoFASetup ? (
          <form onSubmit={onConfirm2FA} className="space-y-3 rounded-lg border border-kurator-border bg-kurator-bg/40 p-4">
            <p className="text-xs text-kurator-muted">
              Scan this URI in your authenticator app, or enter the secret manually:
            </p>
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-black/40 p-2 font-mono text-[11px] text-zinc-300">
              {twoFASetup.otpauth_url}
            </pre>
            <p className="text-xs text-kurator-muted">
              Secret: <span className="font-mono text-zinc-300">{twoFASetup.secret}</span>
            </p>
            <label className="block text-sm">
              <span className="text-kurator-muted">Code from app</span>
              <input
                inputMode="numeric"
                required
                className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                value={enableCode}
                onChange={(e) => setEnableCode(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent disabled:opacity-50"
              >
                Confirm and Enable
              </button>
              <button
                type="button"
                className="rounded-lg border border-kurator-border px-4 py-2 text-sm text-kurator-muted hover:text-kurator-fg"
                onClick={() => {
                  setTwoFASetup(null);
                  setEnableCode("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onBegin2FA()}
            className="rounded-lg border border-kurator-border px-4 py-2 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-50"
          >
            Set Up Authenticator
          </button>
        )}
      </section>
      </div>

      {message ? (
        <p
          className={`text-sm ${message.startsWith("Saved") || message.includes("on.") || message.includes("off.") ? "text-emerald-400" : "text-red-400"}`}
        >
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-kurator-border pt-6">
        <button
          type="button"
          onClick={() => void onLogout()}
          className="rounded-lg border border-kurator-border px-4 py-2 text-sm text-kurator-muted hover:text-kurator-fg"
        >
          Log Out
        </button>
        <Link href="/" className="rounded-lg px-4 py-2 text-sm text-kurator-accent hover:underline">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
