"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const boxId = "kurator-barcode-region";

export function BarcodeScannerPlaceholder() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    return () => {
      void (async () => {
        if (scannerRef.current && runningRef.current) {
          try {
            await scannerRef.current.stop();
          } catch {
            /* ignore */
          }
        }
        scannerRef.current = null;
        runningRef.current = false;
      })();
    };
  }, []);

  async function start() {
    setErr(null);
    setLastCode(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      setErr("Camera API not available in this context (use HTTPS or localhost).");
      return;
    }
    setSupported(true);

    try {
      const scanner = new Html5Qrcode(boxId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 260, height: 120 } },
        (decoded) => {
          setLastCode(decoded);
        },
        () => {
          /* frame-no-match */
        }
      );
      runningRef.current = true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start camera.");
    }
  }

  async function stop() {
    if (scannerRef.current && runningRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        /* ignore */
      }
      runningRef.current = false;
    }
    scannerRef.current = null;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-kurator-muted">
        Try the camera below. Full barcode-to-title matching is coming later.
      </p>
      <div
        id={boxId}
        className="mx-auto aspect-video w-full max-w-md overflow-hidden rounded-xl border border-kurator-border bg-black"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void start()}
          className="rounded-lg bg-kurator-accent px-4 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90"
        >
          Start Camera
        </button>
        <button
          type="button"
          onClick={() => void stop()}
          className="rounded-lg border border-kurator-border px-4 py-2 text-sm font-medium text-kurator-fg hover:bg-kurator-border/40"
        >
          Stop
        </button>
      </div>
      {supported === false && (
        <p className="text-sm text-amber-300">Camera not supported in this browser session.</p>
      )}
      {err && (
        <p className="text-sm text-red-400" role="alert">
          {err}
        </p>
      )}
      {lastCode && (
        <p className="rounded-lg border border-kurator-border bg-kurator-surface px-3 py-2 text-sm text-kurator-muted">
          Last read: <span className="font-mono text-kurator-fg">{lastCode}</span>
        </p>
      )}
    </div>
  );
}
