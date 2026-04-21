"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import {
  requestPasswordRecovery,
  resetPasswordWithToken,
  verifyPasswordRecoveryCode,
} from "@/lib/auth";

type Props = {
  turnstileSiteKey: string;
  turnstileEnabled: boolean;
};

type Step = 1 | 2 | 3;

export function ForgotPasswordClient({ turnstileSiteKey, turnstileEnabled }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileMountKey, setTurnstileMountKey] = useState(0);

  async function onRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (turnstileEnabled && !turnstileToken) {
      setMessage("Complete the verification challenge below.");
      return;
    }
    setBusy(true);
    try {
      await requestPasswordRecovery(email, turnstileEnabled ? (turnstileToken ?? undefined) : undefined);
      setStep(2);
      setTurnstileToken(null);
      if (turnstileEnabled) {
        setTurnstileMountKey((k) => k + 1);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed.");
      setTurnstileToken(null);
      if (turnstileEnabled) {
        setTurnstileMountKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (turnstileEnabled && !turnstileToken) {
      setMessage("Complete the verification challenge below.");
      return;
    }
    setBusy(true);
    try {
      const out = await verifyPasswordRecoveryCode(
        email,
        code,
        turnstileEnabled ? (turnstileToken ?? undefined) : undefined,
      );
      setResetToken(out.reset_token);
      setStep(3);
      setTurnstileToken(null);
      if (turnstileEnabled) {
        setTurnstileMountKey((k) => k + 1);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Verification failed.");
      setTurnstileToken(null);
      if (turnstileEnabled) {
        setTurnstileMountKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetToken) return;
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setMessage("Complete the verification challenge below.");
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithToken(
        resetToken,
        newPassword,
        turnstileEnabled ? (turnstileToken ?? undefined) : undefined,
      );
      router.push("/login?reset=1");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Reset failed.");
      setTurnstileToken(null);
      if (turnstileEnabled) {
        setTurnstileMountKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-kurator-fg">Reset password</h1>
      <p className="mt-1 text-sm text-kurator-muted">
        {step === 1 && "Enter your account email to receive a 6-digit code."}
        {step === 2 && "Enter the code from your email."}
        {step === 3 && "Choose a new password."}
      </p>

      {step === 1 && (
        <form
          onSubmit={onRequestCode}
          className="mt-8 space-y-4"
          autoComplete="off"
          data-lpignore="true"
        >
          <label className="block text-sm">
            <span className="text-kurator-muted">Email</span>
            <input
              type="email"
              required
              name="recovery_email"
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {turnstileEnabled && (
            <div className="flex min-h-[65px] justify-center">
              <TurnstileWidget
                key={turnstileMountKey}
                siteKey={turnstileSiteKey.trim()}
                onToken={setTurnstileToken}
                theme="auto"
              />
            </div>
          )}
          {message && (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || (turnstileEnabled && !turnstileToken)}
            className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Please wait…" : "Send Code"}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={onVerifyCode} className="mt-8 space-y-4">
          <p className="text-sm text-kurator-muted">
            If an account exists for <span className="text-kurator-fg">{email}</span>, we sent a code. It
            expires in 15 minutes.
          </p>
          <label className="block text-sm">
            <span className="text-kurator-muted">6-digit code</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              required
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm tracking-widest text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          {turnstileEnabled && (
            <div className="flex min-h-[65px] justify-center">
              <TurnstileWidget
                key={turnstileMountKey}
                siteKey={turnstileSiteKey.trim()}
                onToken={setTurnstileToken}
                theme="auto"
              />
            </div>
          )}
          {message && (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || (turnstileEnabled && !turnstileToken) || code.length !== 6}
            className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify Code"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-kurator-muted hover:text-kurator-fg"
            onClick={() => {
              setStep(1);
              setCode("");
              setMessage(null);
            }}
          >
            Back
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={onResetPassword} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="text-kurator-muted">New password</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Confirm password</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          {turnstileEnabled && (
            <div className="flex min-h-[65px] justify-center">
              <TurnstileWidget
                key={turnstileMountKey}
                siteKey={turnstileSiteKey.trim()}
                onToken={setTurnstileToken}
                theme="auto"
              />
            </div>
          )}
          {message && (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || (turnstileEnabled && !turnstileToken)}
            className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Update Password"}
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-kurator-muted">
        <Link href="/login" className="text-kurator-accent hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
