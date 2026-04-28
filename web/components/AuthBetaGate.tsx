"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { fetchBetaAccessStatus, unlockBetaAccess } from "@/lib/auth";

export function AuthBetaGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const shouldGatePath = pathname?.startsWith("/register") ?? false;
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [showGate, setShowGate] = useState(false);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const trimmed = key.trim();
    if (!trimmed) {
      setMessage("Enter your beta access key.");
      return;
    }
    setBusy(true);
    try {
      await unlockBetaAccess(trimmed);
      setShowGate(false);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not validate key.");
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
      <div className="mx-auto w-full max-w-md space-y-4">
        <h2 className="text-xl font-semibold text-kurator-fg">Private beta</h2>
        <p className="text-sm text-kurator-muted">
          Enter the beta access key you received. After it is accepted, you can continue creating your account.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-kurator-muted">Beta access key</span>
            <input
              type="text"
              name="beta-key"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your key"
            />
          </label>
          {message ? (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="w-full rounded-lg bg-kurator-accent py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
