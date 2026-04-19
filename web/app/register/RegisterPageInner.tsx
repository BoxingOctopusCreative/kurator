"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { UnsplashMarketingShell } from "@/components/UnsplashMarketingShell";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";
import { register } from "@/lib/auth";
import { Copyright } from "@/components/Copyright";

type Props = {
  initialBackground: UnsplashBackgroundPayload | null;
  turnstileSiteKey: string;
  turnstileEnabled: boolean;
};

export function RegisterPageInner({ initialBackground, turnstileSiteKey, turnstileEnabled }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileMountKey, setTurnstileMountKey] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (turnstileEnabled && !turnstileToken) {
      setMessage("Complete the verification challenge below.");
      return;
    }
    setBusy(true);
    try {
      await register(
        email,
        password,
        displayName,
        username.trim() || undefined,
        turnstileEnabled ? (turnstileToken ?? undefined) : undefined,
      );
      router.push("/");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Registration failed.");
      setTurnstileToken(null);
      if (turnstileEnabled) {
        setTurnstileMountKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <UnsplashMarketingShell initialBackground={initialBackground}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-4 flex justify-center">
          <Image
            src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
            alt="Kurator"
            width={600}
            height={300}
            className="mb-8 max-w-full h-auto w-auto [filter:drop-shadow(0_2px_6px_rgba(0,0,0,0.5))_drop-shadow(0_8px_28px_rgba(0,0,0,0.5))]"
            priority
          />
        </div>
        <h1 className="text-2xl font-semibold text-kurator-fg">Create account</h1>
        <p className="mt-1 text-sm text-kurator-muted">
          Kurator stores credentials in your database — no external identity provider.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
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
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="mt-1 block text-xs text-kurator-muted">At least 8 characters.</span>
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Display name (optional)</span>
            <input
              type="text"
              autoComplete="nickname"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Defaults to the part before @ in your email"
            />
          </label>
          <label className="block text-sm">
            <span className="text-kurator-muted">Username (optional)</span>
            <input
              type="text"
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-none ring-kurator-accent focus:ring-2"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="your-public-url — lowercase letters, digits, _ -"
            />
            <span className="mt-1 block text-xs text-kurator-muted">
              Your profile will be at /people/your-username. Leave blank to pick one from your email.
            </span>
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
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-kurator-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-kurator-accent hover:underline">
            Log in
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-kurator-muted">
          <Link href="/privacy" className="text-kurator-accent/90 hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
      <Copyright />
    </UnsplashMarketingShell>
  );
}
