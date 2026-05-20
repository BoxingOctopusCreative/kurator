"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchLinkedOAuthIdentities,
  fetchOAuthProviders,
  navigateToOAuthUrl,
  oauthLinkPath,
  type LinkedOAuthIdentity,
  type OAuthProvider,
  unlinkOAuthProvider,
} from "@/lib/oauth";

type Props = {
  oauthLinkError: string | null;
  oauthLinkedSuccess: string | null;
  onClearOAuthFeedback: () => void;
};

function providerLabel(id: string): string {
  if (id === "google") return "Google";
  if (id === "discord") return "Discord";
  return id;
}

export function AppSettingsOAuthSection({
  oauthLinkError,
  oauthLinkedSuccess,
  onClearOAuthFeedback,
}: Props) {
  const [available, setAvailable] = useState<OAuthProvider[]>([]);
  const [linked, setLinked] = useState<LinkedOAuthIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [providers, identities] = await Promise.all([
        fetchOAuthProviders(),
        fetchLinkedOAuthIdentities(),
      ]);
      setAvailable(providers);
      setLinked(identities);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load sign-in methods.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (oauthLinkedSuccess) {
      void reload();
    }
  }, [oauthLinkedSuccess, reload]);

  if (!loading && available.length === 0) {
    return null;
  }

  const linkedIds = new Set(linked.map((i) => i.provider));

  async function onUnlink(providerId: string) {
    onClearOAuthFeedback();
    setMessage(null);
    setBusyProvider(providerId);
    try {
      await unlinkOAuthProvider(providerId);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not unlink.");
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <section className="space-y-4 border-t border-kurator-border pt-8">
      <h2 className="kurator-panel-title text-kurator-fg">Sign-In Methods</h2>
      <p className="text-sm text-kurator-muted">
        Connect Google or Discord to sign in without your password. Your Kurator email does not need to
        match the address on the provider account.
      </p>

      {oauthLinkedSuccess && (
        <p className="rounded-lg border border-green-700/50 bg-green-950/40 px-3 py-2 text-sm text-green-200" role="status">
          {oauthLinkedSuccess}
        </p>
      )}
      {oauthLinkError && (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
          {oauthLinkError}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-kurator-muted">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {available.map((p) => {
            const row = linked.find((i) => i.provider === p.id);
            const isLinked = linkedIds.has(p.id);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-kurator-border bg-kurator-bg/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-kurator-fg">{p.label}</p>
                  <p className="text-xs text-kurator-muted">
                    {isLinked
                      ? row?.provider_email
                        ? `Linked as ${row.provider_email}`
                        : `Linked (${providerLabel(p.id)})`
                      : "Not linked"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {isLinked ? (
                    <button
                      type="button"
                      disabled={busyProvider === p.id}
                      onClick={() => void onUnlink(p.id)}
                      className="rounded-lg border border-kurator-border px-3 py-1.5 text-sm text-kurator-muted hover:text-kurator-fg disabled:opacity-50"
                    >
                      {busyProvider === p.id ? "Removing…" : "Unlink"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg bg-kurator-accent px-3 py-1.5 text-sm font-medium text-kurator-onAccent hover:opacity-90"
                      onClick={() => navigateToOAuthUrl(oauthLinkPath(p.id))}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
