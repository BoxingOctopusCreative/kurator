"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchSetupInfo,
  fetchSetupStatus,
  runSetupMigrate,
  type SetupStatus,
} from "@/lib/api";
import {
  assertDbHost,
  assertDbPassword,
  assertDbUserOrName,
  assertPort,
  assertPostgresDatabaseUrl,
  assertSslMode,
} from "@/lib/validation";

export default function SetupPage() {
  const [info, setInfo] = useState<{ setup_enabled: boolean } | null>(null);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [user, setUser] = useState("kurator");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("kurator");
  const [sslmode, setSslmode] = useState("disable");
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [useUrl, setUseUrl] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSetupInfo()
      .then((i) => {
        if (!cancelled) setInfo(i);
      })
      .catch(() => {
        if (!cancelled) setInfo({ setup_enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!info?.setup_enabled) return;
    let cancelled = false;
    fetchSetupStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [info?.setup_enabled]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const body = useUrl
        ? { database_url: assertPostgresDatabaseUrl(databaseUrl) }
        : {
            host: assertDbHost(host),
            port: assertPort(parseInt(port, 10) || 5432),
            user: assertDbUserOrName(user, "User"),
            password: assertDbPassword(password),
            database: assertDbUserOrName(database, "Database"),
            sslmode: assertSslMode(sslmode),
          };
      const out = await runSetupMigrate(body);
      const lines =
        out.applied.length > 0
          ? `Applied: ${out.applied.join(", ")}`
          : "Database was already up to date (no new migrations).";
      setMessage(lines);
      const s = await fetchSetupStatus();
      setStatus(s);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Migration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function migrateUsingServerDatabaseUrl() {
    setMessage(null);
    setBusy(true);
    try {
      const out = await runSetupMigrate({});
      setMessage(
        out.applied.length > 0
          ? `Applied: ${out.applied.join(", ")}`
          : "Database was already up to date (no new migrations).",
      );
      const s = await fetchSetupStatus();
      setStatus(s);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Migration failed.");
    } finally {
      setBusy(false);
    }
  }

  if (info === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <p className="text-sm text-kurator-muted">Loading…</p>
      </div>
    );
  }

  if (!info.setup_enabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-2xl font-semibold text-kurator-fg">Database setup</h1>
        <p className="mt-3 text-sm text-kurator-muted">
          The setup API is disabled on this server. Start the API with{" "}
          <code className="rounded-sm bg-kurator-border/60 px-1 py-0.5 text-xs text-zinc-200">SETUP_ENABLED=true</code>{" "}
          to run migrations from the web UI, or apply SQL files under{" "}
          <code className="rounded-sm bg-kurator-border/60 px-1 py-0.5 text-xs text-zinc-200">api/migrations/</code>{" "}
          using your own tooling.
        </p>
        <p className="mt-6">
          <Link href="/" className="text-sm text-kurator-accent hover:underline">
            ← Back home
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold text-kurator-fg">Database setup</h1>
      <p className="mt-2 text-sm text-kurator-muted">
        Connect to a PostgreSQL database and apply Kurator&apos;s schema migrations. Use the same connection
        string as <code className="text-xs text-zinc-300">DATABASE_URL</code> on the API server.
      </p>

      {status?.connected && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            status.pending
              ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {status.pending ? (
            <span>Migrations are pending (server config database).</span>
          ) : (
            <span>All bundled migrations are applied ({status.applied_count ?? 0} recorded).</span>
          )}
        </div>
      )}

      {status?.message && (
        <p className="mt-3 text-sm text-amber-200/90" role="status">
          Status check: {status.message}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-kurator-muted">
          <input
            type="checkbox"
            checked={useUrl}
            onChange={(e) => setUseUrl(e.target.checked)}
            className="rounded-sm border-kurator-border"
          />
          Use full connection URL
        </label>

        {useUrl ? (
          <label className="block text-sm">
            <span className="text-kurator-muted">postgres://…</span>
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 font-mono text-xs text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
              value={databaseUrl}
              onChange={(e) => setDatabaseUrl(e.target.value)}
              placeholder="postgres://user:pass@host:5432/dbname?sslmode=disable"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-kurator-muted">Host</span>
                <input
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="text-kurator-muted">Port</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-kurator-muted">SSL mode</span>
                <select
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={sslmode}
                  onChange={(e) => setSslmode(e.target.value)}
                >
                  <option value="disable">disable</option>
                  <option value="prefer">prefer</option>
                  <option value="require">require</option>
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-kurator-muted">User</span>
                <input
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="username"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-kurator-muted">Password</span>
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-kurator-muted">Database name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-kurator-border bg-kurator-bg px-3 py-2 text-sm text-kurator-fg outline-hidden ring-kurator-accent focus:ring-2"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>
          </>
        )}

        {message && (
          <p className="text-sm text-kurator-muted" role="status">
            {message}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-kurator-accent px-4 py-2.5 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Running…" : "Run Migrations"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void migrateUsingServerDatabaseUrl()}
            className="rounded-lg border border-kurator-border px-4 py-2.5 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40 disabled:opacity-50"
          >
            Use Server DATABASE_URL
          </button>
        </div>
      </form>

      <p className="mt-8 text-xs leading-relaxed text-kurator-muted">
        In production, disable this endpoint after bootstrap: unset{" "}
        <code className="text-[11px] text-zinc-400">SETUP_ENABLED</code> or set it to false.
      </p>

      <p className="mt-4">
        <Link href="/" className="text-sm text-kurator-accent hover:underline">
          ← Back home
        </Link>
      </p>
    </div>
  );
}
