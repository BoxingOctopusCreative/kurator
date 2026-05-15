"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { reactivateAccount } from "@/lib/accountDeletion";

function ReactivateAccountInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "working" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token.trim()) {
      setStatus("error");
      setMessage("This reactivation link is missing a token.");
      return;
    }
    let cancelled = false;
    setStatus("working");
    void reactivateAccount(token)
      .then(() => {
        if (cancelled) return;
        setStatus("ok");
        setMessage("Your account has been reactivated. You can sign in with your existing password.");
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Reactivation failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="kurator-panel-title text-kurator-fg">Reactivate account</h1>
      {status === "working" ? (
        <p className="mt-4 text-sm text-kurator-muted">Restoring your account…</p>
      ) : (
        <p
          className={`mt-4 text-sm ${status === "ok" ? "text-emerald-400" : "text-amber-200/90"}`}
          role={status === "error" ? "alert" : undefined}
        >
          {message}
        </p>
      )}
      {status === "ok" ? (
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90"
        >
          Sign in
        </Link>
      ) : null}
    </main>
  );
}

export default function ReactivateAccountPage() {
  return (
    <Suspense fallback={<p className="px-4 py-16 text-sm text-kurator-muted">Loading…</p>}>
      <ReactivateAccountInner />
    </Suspense>
  );
}
