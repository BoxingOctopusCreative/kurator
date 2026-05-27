import type { Metadata } from "next";
import { preload } from "react-dom";
import { fetchUnsplashBackground } from "@/lib/unsplash-background.server";
import { isCloudflareTurnstileEnabled } from "@/lib/turnstile-config";
import { ForgotPasswordPageInner } from "./ForgotPasswordPageInner";

export const metadata: Metadata = {
  title: "Reset Password",
};

/** Reads Turnstile/Unsplash from container env at request time; avoid static prerender locking them to build-time empties. */
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const initialBackground = await fetchUnsplashBackground();
  if (initialBackground?.url) {
    preload(initialBackground.url, {
      as: "image",
      fetchPriority: "high",
    });
  }

  const turnstileSiteKey =
    process.env.CLOUDFLARE_TURNSTILE_SITEKEY?.trim() ||
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITEKEY?.trim() ||
    "";
  const turnstileEnabled =
    isCloudflareTurnstileEnabled() && Boolean(turnstileSiteKey.trim());

  return (
    <ForgotPasswordPageInner
      initialBackground={initialBackground}
      turnstileSiteKey={turnstileSiteKey}
      turnstileEnabled={turnstileEnabled}
    />
  );
}
