"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { fetchBetaAccessStatus, requestBetaAccess } from "@/lib/auth";

type Props = {
  children: ReactNode;
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string;
};

export function AuthBetaGate({ children, turnstileEnabled = false, turnstileSiteKey = "" }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const shouldGatePath = pathname?.startsWith("/register") ?? false;
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [showGate, setShowGate] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"muted" | "bad">("muted");
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileMountKey, setTurnstileMountKey] = useState(0);

  useEffect(() => {
    if (!shouldGatePath) {
      setPhase("ready");
      setShowGate(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchBetaAccessStatus();
        if (cancelled) return;
        if (s.required && !s.unlocked && shouldGatePath) {
          setShowGate(true);
        }
      } catch {
        /* offline / API error: allow normal auth UI */
      } finally {
        if (!cancelled) setPhase("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldGatePath]);

  useEffect(() => {
    if (typeof window === "undefined" || !shouldGatePath) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("beta_error") !== "invite") return;
    setMessageTone("bad");
    setMessage("This registration link is invalid or has expired. You can request access again below.");
    sp.delete("beta_error");
    const q = sp.toString();
    const path = pathname ?? "/register";
    router.replace(q ? `${path}?${q}` : path);
  }, [pathname, router, shouldGatePath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setMessageTone("muted");
    const trimmed = email.trim();
    if (!trimmed) {
      setMessageTone("bad");
      setMessage("Enter your email address.");
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setMessageTone("bad");
      setMessage("Complete the verification challenge below.");
      return;
    }
    setBusy(true);
    try {
      const res = await requestBetaAccess(trimmed, turnstileEnabled ? (turnstileToken ?? undefined) : undefined);
      setMessageTone(res.ok ? "muted" : "bad");
      setMessage(res.message ?? "Request received.");
      setTurnstileToken(null);
      if (turnstileEnabled) {
        setTurnstileMountKey((k) => k + 1);
      }
    } catch (err) {
      setMessageTone("bad");
      setMessage(err instanceof Error ? err.message : "Could not submit request.");
      setTurnstileToken(null);
      if (turnstileEnabled) {
        setTurnstileMountKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="w-full max-w-md py-8 text-center text-sm text-kurator-muted" aria-busy>
        Loading…
      </div>
    );
  }

  if (showGate) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-4 flex justify-center">
          <Image
            src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
            alt="Kurator"
            width={600}
            height={300}
            className="mb-8 h-auto w-auto max-w-full filter-[drop-shadow(0_2px_6px_rgba(0,0,0,0.5))_drop-shadow(0_8px_28px_rgba(0,0,0,0.5))]"
            priority
          />
        </div>
        <h2 className="text-xl font-semibold text-kurator-fg">Private beta</h2>
        <p className="mt-1 text-sm text-kurator-muted">
          Enter the email you would like to use for your account. We will notify the team; if your request is approved,
          you will receive a link to continue registration at that address.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-3">
          <label className="block text-sm">
            <span className="text-kurator-muted">Email</span>
            <input
              type="email"
              name="beta-request-email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {turnstileEnabled && turnstileSiteKey ? (
            <TurnstileWidget
              key={turnstileMountKey}
              siteKey={turnstileSiteKey}
              onToken={setTurnstileToken}
              className="flex justify-center"
            />
          ) : null}
          {message ? (
            <p
              className={`text-sm ${messageTone === "bad" ? "text-red-400" : "text-kurator-muted"}`}
              role="status"
            >
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Request access"}
          </button>
          <p className="pt-1 text-center text-sm text-kurator-muted">
            <Link href="/login" className="text-kurator-accent hover:underline">
              Back to Log In
            </Link>
          </p>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
