"use client";

import { useEffect, useState } from "react";
import { fetchPasskeysEnabled, loginWithPasskey } from "@/lib/passkeys";

type Props = {
  email: string;
  disabled?: boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function PasskeySignInButton({ email, disabled, onSuccess, onError }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchPasskeysEnabled().then((ok) => {
      if (!cancelled) setEnabled(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled !== true) {
    return null;
  }

  async function onClick() {
    onError("");
    setBusy(true);
    try {
      await loginWithPasskey(email);
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Passkey sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => void onClick()}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2.5 text-sm font-medium text-kurator-fg hover:bg-kurator-border/30 disabled:opacity-50"
    >
      <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3c-1.5 2.2-4 3.8-4 7.5a4 4 0 108 0C16 6.8 13.5 5.2 12 3z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M10 17h4" />
      </svg>
      {busy ? "Waiting for passkey…" : "Sign in with passkey"}
    </button>
  );
}
