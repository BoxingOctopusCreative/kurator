"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deletePasskey,
  fetchPasskeysEnabled,
  listPasskeys,
  registerPasskey,
  renamePasskey,
  type PasskeyCredential,
} from "@/lib/passkeys";

export function AppSettingsPasskeysSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("My passkey");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listPasskeys();
      setCredentials(list);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load passkeys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPasskeysEnabled().then((ok) => {
      if (!cancelled) setEnabled(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (enabled) void reload();
    else setLoading(false);
  }, [enabled, reload]);

  if (enabled !== true) {
    return null;
  }

  async function onAdd() {
    setMessage(null);
    setBusy(true);
    try {
      await registerPasskey(nickname);
      setMessage("Passkey added.");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add passkey.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: number) {
    if (!window.confirm("Remove this passkey from your account?")) return;
    setBusy(true);
    setMessage(null);
    try {
      await deletePasskey(id);
      setMessage("Passkey removed.");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove passkey.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveRename(id: number) {
    setBusy(true);
    setMessage(null);
    try {
      await renamePasskey(id, renameValue);
      setRenamingId(null);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not rename passkey.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-kurator-border pt-8">
      <h2 className="kurator-panel-title text-kurator-fg">Passkeys</h2>
      <p className="text-sm text-kurator-muted">
        Use Face ID, Touch ID, Windows Hello, or a security key to sign in without your password.
        Add a passkey while signed in, then use it on the log in page.
      </p>
      {message ? (
        <p className="text-sm text-kurator-muted" role="status">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-kurator-muted">Label for new passkey</span>
          <input
            type="text"
            maxLength={64}
            className="mt-1 w-full min-w-[12rem] rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAdd()}
          className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Follow device prompt…" : "Add passkey"}
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-kurator-muted">Loading passkeys…</p>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-kurator-muted">No passkeys yet.</p>
      ) : (
        <ul className="divide-y divide-kurator-border rounded-lg border border-kurator-border">
          {credentials.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                {renamingId === c.id ? (
                  <input
                    type="text"
                    maxLength={64}
                    className="w-full rounded border border-kurator-border bg-kurator-bg px-2 py-1 text-sm text-kurator-fg"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                  />
                ) : (
                  <>
                    <p className="font-medium text-kurator-fg">{c.nickname}</p>
                    <p className="text-xs text-kurator-muted">
                      Added {new Date(c.created_at).toLocaleDateString()}
                      {c.last_used_at
                        ? ` · Last used ${new Date(c.last_used_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {renamingId === c.id ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-kurator-border px-3 py-1.5 text-sm text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-50"
                      onClick={() => void onSaveRename(c.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-sm text-kurator-muted hover:text-kurator-fg"
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-kurator-border px-3 py-1.5 text-sm text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-50"
                      onClick={() => {
                        setRenamingId(c.id);
                        setRenameValue(c.nickname);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-red-800/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                      onClick={() => void onRemove(c.id)}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
