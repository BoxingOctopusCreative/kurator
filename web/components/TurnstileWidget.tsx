"use client";

import { useEffect, useRef } from "react";
import { loadTurnstileScript } from "@/lib/turnstile-script";

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
};

/**
 * Renders Cloudflare Turnstile (managed). Parent should bump `key` after failed auth to get a fresh token.
 */
export function TurnstileWidget({ siteKey, onToken, theme = "auto", className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (!el || !siteKey) {
      return;
    }

    (async () => {
      try {
        await loadTurnstileScript();
      } catch {
        if (!cancelled) {
          onTokenRef.current(null);
        }
        return;
      }
      if (cancelled || !containerRef.current || !window.turnstile) {
        return;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        callback: (t: string) => onTokenRef.current(t),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
    })();

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id && typeof window !== "undefined" && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* ignore */
        }
      }
    };
  }, [siteKey, theme]);

  return <div ref={containerRef} className={className} />;
}
