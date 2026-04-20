"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { LDProvider, useFlags, type LDContext } from "launchdarkly-react-client-sdk";
import type { AuthUser } from "@/lib/auth";
import { LD_FLAG_BARCODE_SCAN_NAV } from "@/lib/featureFlags";

type FeatureGateValue = {
  showBarcodeScanNav: boolean;
};

const FeatureGateContext = createContext<FeatureGateValue>({
  showBarcodeScanNav: false,
});

export function useFeatureGates(): FeatureGateValue {
  return useContext(FeatureGateContext);
}

function LaunchDarklyBridge({ children }: { children: ReactNode }) {
  const flags = useFlags();
  const showBarcodeScanNav = flags[LD_FLAG_BARCODE_SCAN_NAV] === true;
  const value = useMemo(() => ({ showBarcodeScanNav }), [showBarcodeScanNav]);
  return <FeatureGateContext.Provider value={value}>{children}</FeatureGateContext.Provider>;
}

type Props = {
  user: AuthUser;
  children: ReactNode;
};

export function LoggedInFeatureFlags({ user, children }: Props) {
  const clientSideId = process.env.NEXT_PUBLIC_LAUNCHDARKLY_CLIENT_SIDE_ID;
  const ldContext = useMemo<LDContext>(
    () => ({
      kind: "user",
      key: String(user.id),
      email: user.email,
    }),
    [user.email, user.id]
  );

  if (!clientSideId) {
    return (
      <FeatureGateContext.Provider value={{ showBarcodeScanNav: false }}>
        {children}
      </FeatureGateContext.Provider>
    );
  }

  return (
    <LDProvider
      clientSideID={clientSideId}
      context={ldContext}
      reactOptions={{ useCamelCaseFlagKeys: false }}
    >
      <LaunchDarklyBridge>{children}</LaunchDarklyBridge>
    </LDProvider>
  );
}
