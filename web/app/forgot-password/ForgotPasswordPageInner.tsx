"use client";

import Image from "next/image";
import { Suspense } from "react";
import { UnsplashMarketingShell } from "@/components/UnsplashMarketingShell";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";
import { Copyright } from "@/components/Copyright";
import { LegalPolicyLinks } from "@/components/LegalPolicyLinks";
import { ForgotPasswordClient } from "./ForgotPasswordClient";

type Props = {
  initialBackground: UnsplashBackgroundPayload | null;
  turnstileSiteKey: string;
  turnstileEnabled: boolean;
};

function FormFallback() {
  return (
    <div className="w-full max-w-md py-8 text-center text-sm text-kurator-muted" aria-busy>
      Loading…
    </div>
  );
}

export function ForgotPasswordPageInner({
  initialBackground,
  turnstileSiteKey,
  turnstileEnabled,
}: Props) {
  return (
    <UnsplashMarketingShell initialBackground={initialBackground}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-4 flex justify-center">
          <Image
            src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
            alt="Kurator"
            width={600}
            height={300}
            className="mb-8 max-w-full h-auto w-auto filter-[drop-shadow(0_2px_6px_rgba(0,0,0,0.5))_drop-shadow(0_8px_28px_rgba(0,0,0,0.5))]"
            priority
          />
        </div>
        <Suspense fallback={<FormFallback />}>
          <ForgotPasswordClient
            turnstileSiteKey={turnstileSiteKey}
            turnstileEnabled={turnstileEnabled}
          />
        </Suspense>
      </div>
      <LegalPolicyLinks className="mb-3 text-center text-xs text-kurator-muted" />
      <Copyright />
    </UnsplashMarketingShell>
  );
}
