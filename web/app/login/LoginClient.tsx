"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { completeLogin2FA, login } from "@/lib/auth";

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [totp, setTotp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const out = await login(email, password);
      if (out.two_factor_required) {
        setPendingToken(out.pending_token);
        return;
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function on2FA(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setMessage(null);
    setBusy(true);
    try {
      await completeLogin2FA(pendingToken, totp.replace(/\s/g, ""));
      router.push(next);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-kurator-fg">Log in</h1>
      <p className="mt-1 text-sm text-kurator-muted">
        Use the email and password for your Kurator account.
      </p>

      {!pendingToken ? (
        <form onSubmit={onPasswordLogin} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="text-kurator-muted">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Please wait…" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={on2FA} className="mt-8 space-y-4">
          <p className="text-sm text-kurator-muted">
            Enter the 6-digit code from your authenticator app.
          </p>
          <label className="block text-sm">
            <span className="text-kurator-muted">Authenticator code</span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={8}
              required
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm tracking-widest text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
            />
          </label>
          {message && (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify and log in"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-kurator-muted hover:text-kurator-fg"
            onClick={() => {
              setPendingToken(null);
              setTotp("");
              setMessage(null);
            }}
          >
            Back
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-kurator-muted">
        No account?{" "}
        <Link href="/register" className="text-kurator-accent hover:underline">
          Register
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-kurator-muted">
        <Link href="/privacy" className="text-kurator-accent/90 hover:underline">
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
