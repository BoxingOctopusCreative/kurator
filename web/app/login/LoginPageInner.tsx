"use client";

import Image from "next/image";
import { Suspense } from "react";
import { UnsplashMarketingShell } from "@/components/UnsplashMarketingShell";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";
import { AuthBetaGate } from "@/components/AuthBetaGate";
import { LoginClient } from "./LoginClient";
import { Copyright } from "@/components/Copyright";

type Props = {
  initialBackground: UnsplashBackgroundPayload | null;
  turnstileSiteKey: string;
  turnstileEnabled: boolean;
};

function LoginFormFallback() {
  return (
    <div className="w-full max-w-md py-8 text-center text-sm text-kurator-muted" aria-busy>
      Loading…
    </div>
  );
}

export function LoginPageInner({ initialBackground, turnstileSiteKey, turnstileEnabled }: Props) {
  return (
    <UnsplashMarketingShell initialBackground={initialBackground}>
      <AuthBetaGate>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12">
          <div className="mb-4 flex justify-center">
            <Image
              src="https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png"
              alt="Kurator"
              width={600}
              height={300}
              className="kurator-logo-shadow mb-8 max-w-full h-auto w-auto"
              priority
            />
          </div>
          <Suspense fallback={<LoginFormFallback />}>
            <LoginClient turnstileSiteKey={turnstileSiteKey} turnstileEnabled={turnstileEnabled} />
          </Suspense>
        </div>
      </AuthBetaGate>
      <Copyright />
    </UnsplashMarketingShell>
  );
}
