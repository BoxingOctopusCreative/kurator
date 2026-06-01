"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { OnboardingCompletionModal } from "@/components/onboarding/OnboardingCompletionModal";
import { OnboardingSpotlight } from "@/components/onboarding/OnboardingSpotlight";
import { OnboardingTooltip } from "@/components/onboarding/OnboardingTooltip";
import {
  ONBOARDING_MIN_SHELF_ITEMS,
  advanceOnboardingStep,
  completeOnboarding,
  effectiveOnboardingStep,
  fetchOnboardingStatus,
  mfaStepReady,
  profileStepReady,
  shouldRunOnboarding,
  type OnboardingStatus,
  type OnboardingStep,
} from "@/lib/onboarding";

const STEP_TARGETS: Record<OnboardingStep, string> = {
  1: "profile-setup",
  2: "mfa-setup",
  3: "collection-create",
  4: "wishlist-create",
  5: "completion",
};

type OnboardingContextValue = {
  active: boolean;
  step: OnboardingStep;
  status: OnboardingStatus | null;
  registerTarget: (id: string, el: HTMLElement | null) => void;
  collectionCreateOpen: boolean;
  setCollectionCreateOpen: (open: boolean) => void;
  wishlistCreateOpen: boolean;
  setWishlistCreateOpen: (open: boolean) => void;
  addItemModalOpen: boolean;
  setAddItemModalOpen: (open: boolean) => void;
  onShelfCreated: (kind: "collection" | "wishlist", shelfId: string) => void;
  begin2FA: boolean;
  setBegin2FA: (v: boolean) => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const targetsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [targetVersion, setTargetVersion] = useState(0);
  const [collectionCreateOpen, setCollectionCreateOpen] = useState(false);
  const [wishlistCreateOpen, setWishlistCreateOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [begin2FA, setBegin2FA] = useState(false);
  const [activeShelfId, setActiveShelfId] = useState<string | null>(null);
  const [activeShelfKind, setActiveShelfKind] = useState<"collection" | "wishlist" | null>(null);

  const active = Boolean(user && shouldRunOnboarding(user));
  const step = effectiveOnboardingStep(user);

  const registerTarget = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      targetsRef.current.set(id, el);
    } else {
      targetsRef.current.delete(id);
    }
    setTargetVersion((v) => v + 1);
  }, []);

  const reloadStatus = useCallback(async () => {
    try {
      const st = await fetchOnboardingStatus();
      setStatus(st);
      return st;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      setStatus(null);
      return;
    }
    void reloadStatus();
  }, [active, step, reloadStatus]);

  useEffect(() => {
    if (!active) return;
    if (step === 1 && !pathname.startsWith("/profile")) {
      router.replace("/profile");
    } else if (step === 2 && !pathname.startsWith("/settings/app")) {
      router.replace("/settings/app");
    } else if (step === 3) {
      if (activeShelfId && activeShelfKind === "collection") {
        const detail = `/collections/${activeShelfId}`;
        if (pathname !== detail) router.replace(detail);
      } else if (!pathname.startsWith("/collections")) {
        router.replace("/collections");
      }
    } else if (step === 4) {
      if (activeShelfId && activeShelfKind === "wishlist") {
        const detail = `/wishlists/${activeShelfId}`;
        if (pathname !== detail) router.replace(detail);
      } else if (!pathname.startsWith("/wishlists")) {
        router.replace("/wishlists");
      }
    }
  }, [active, step, pathname, router, activeShelfId, activeShelfKind]);

  useEffect(() => {
    if (!active) return;
    if (step === 3 && !activeShelfId) {
      setCollectionCreateOpen(true);
    }
    if (step === 4 && !activeShelfId) {
      setWishlistCreateOpen(true);
    }
    if (step === 2) {
      setBegin2FA(true);
    }
  }, [active, step, activeShelfId]);

  useEffect(() => {
    if (!active || step !== 3 || !status?.collection_shelf_id) return;
    setActiveShelfId(status.collection_shelf_id);
    setActiveShelfKind("collection");
  }, [active, step, status?.collection_shelf_id]);

  useEffect(() => {
    if (!active || step !== 4 || !status?.wishlist_shelf_id) return;
    setActiveShelfId(status.wishlist_shelf_id);
    setActiveShelfKind("wishlist");
  }, [active, step, status?.wishlist_shelf_id]);

  const onShelfCreated = useCallback(
    (kind: "collection" | "wishlist", shelfId: string) => {
      setActiveShelfId(shelfId);
      setActiveShelfKind(kind);
      if (kind === "collection") {
        setCollectionCreateOpen(false);
        router.replace(`/collections/${shelfId}`);
      } else {
        setWishlistCreateOpen(false);
        router.replace(`/wishlists/${shelfId}`);
      }
      void reloadStatus();
    },
    [router, reloadStatus],
  );

  const itemCount =
    step === 3
      ? (status?.collection_item_count ?? 0)
      : step === 4
        ? (status?.wishlist_entry_count ?? 0)
        : 0;

  const profileReady = user ? profileStepReady(user) : false;
  const mfaReady = user ? mfaStepReady(user) : false;
  const shelfItemsReady = itemCount >= ONBOARDING_MIN_SHELF_ITEMS;

  async function handleAdvance(next: number) {
    setBusy(true);
    try {
      const st = await advanceOnboardingStep(next);
      setStatus(st);
      await refresh();
      setActiveShelfId(null);
      setActiveShelfKind(null);
      setAddItemModalOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    setBusy(true);
    try {
      await completeOnboarding();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active || step > 2) return;
    const t = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(t);
  }, [active, step, refresh]);

  useEffect(() => {
    if (!active || (step !== 3 && step !== 4)) return;
    const t = window.setInterval(() => void reloadStatus(), 2500);
    return () => window.clearInterval(t);
  }, [active, step, reloadStatus]);

  const targetId = useMemo(() => {
    if (step === 3) {
      if (collectionCreateOpen) return "collection-create-modal";
      if (status?.collection_shelf_id || activeShelfId) return "collection-add-item";
      return STEP_TARGETS[3];
    }
    if (step === 4) {
      if (wishlistCreateOpen) return "wishlist-create-modal";
      if (status?.wishlist_shelf_id || activeShelfId) return "wishlist-add-item";
      return STEP_TARGETS[4];
    }
    return STEP_TARGETS[step];
  }, [step, status, activeShelfId, collectionCreateOpen, wishlistCreateOpen]);

  const spotlightTarget = useMemo(() => {
    void targetVersion;
    return targetsRef.current.get(targetId) ?? null;
  }, [targetId, targetVersion, step]);

  const value = useMemo(
    () => ({
      active,
      step,
      status,
      registerTarget,
      collectionCreateOpen,
      setCollectionCreateOpen,
      wishlistCreateOpen,
      setWishlistCreateOpen,
      addItemModalOpen,
      setAddItemModalOpen,
      onShelfCreated,
      begin2FA,
      setBegin2FA,
    }),
    [
      active,
      step,
      status,
      registerTarget,
      collectionCreateOpen,
      wishlistCreateOpen,
      addItemModalOpen,
      onShelfCreated,
      begin2FA,
    ],
  );

  let tooltip: ReactNode = null;
  if (active && step < 5) {
    if (step === 1) {
      tooltip = (
        <OnboardingTooltip
          step={1}
          progressLabel="Profile"
          title="Set up your profile"
          body="Add a display name, bio, and profile photo. All three are required before you continue."
          canContinue={profileReady}
          busy={busy}
          onContinue={() => void handleAdvance(2)}
        />
      );
    } else if (step === 2) {
      tooltip = (
        <OnboardingTooltip
          step={2}
          progressLabel="Security"
          title="Secure your account"
          body="Enable two-factor authentication with an authenticator app. You can add passkeys below for passwordless sign-in."
          canContinue={mfaReady}
          busy={busy}
          onContinue={() => void handleAdvance(3)}
        />
      );
    } else if (step === 3) {
      const shelfCreated = Boolean(status?.collection_shelf_id || activeShelfId);
      tooltip = (
        <OnboardingTooltip
          step={3}
          progressLabel="Collection"
          title={shelfCreated ? "Add items to your collection" : "Create a collection shelf"}
          body={
            shelfCreated
              ? `${Math.min(itemCount, ONBOARDING_MIN_SHELF_ITEMS)} of ${ONBOARDING_MIN_SHELF_ITEMS} items added. Use Add item to reach three.`
              : "Create a collection shelf, then add at least three items."
          }
          canContinue={shelfItemsReady}
          busy={busy}
          continueLabel={shelfItemsReady ? "Continue" : undefined}
          onContinue={shelfItemsReady ? () => void handleAdvance(4) : undefined}
        />
      );
    } else if (step === 4) {
      const shelfCreated = Boolean(status?.wishlist_shelf_id || activeShelfId);
      tooltip = (
        <OnboardingTooltip
          step={4}
          progressLabel="Wishlist"
          title={shelfCreated ? "Add items to your wishlist" : "Create a wishlist shelf"}
          body={
            shelfCreated
              ? `${Math.min(itemCount, ONBOARDING_MIN_SHELF_ITEMS)} of ${ONBOARDING_MIN_SHELF_ITEMS} items added. Use Add item to reach three.`
              : "Create a wishlist shelf, then add at least three entries."
          }
          canContinue={shelfItemsReady}
          busy={busy}
          continueLabel={shelfItemsReady ? "Continue" : undefined}
          onContinue={shelfItemsReady ? () => void handleAdvance(5) : undefined}
        />
      );
    }
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {active ? (
        <>
          {step < 5 ? <OnboardingSpotlight target={spotlightTarget} /> : null}
          {tooltip}
          {step === 5 ? (
            <OnboardingCompletionModal open busy={busy} onFinish={() => void handleFinish()} />
          ) : null}
        </>
      ) : null}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}

export function useOnboardingOptional(): OnboardingContextValue | null {
  return useContext(OnboardingContext);
}
