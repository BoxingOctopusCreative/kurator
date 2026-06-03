"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { collectionMayReceiveItems, fetchCollections } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { useOnboardingOptional } from "@/components/onboarding/OnboardingProvider";
import { useOnboardingTarget } from "@/components/onboarding/useOnboardingTarget";
import { CollectionCreateModal } from "@/components/CollectionCreateModal";
import { HitlistCreateModal } from "@/components/HitlistCreateModal";
import { WishlistCreateModal } from "@/components/WishlistCreateModal";

type Props = {
  closeSignal: number;
  onMenuOpen: () => void;
};

type CreateKind = "collection" | "wishlist" | "hitlist" | null;

export function TopBarCreateMenu({ closeSignal, onMenuOpen }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const onboarding = useOnboardingOptional();
  const { ref: collectionCreateRef } = useOnboardingTarget(
    "collection-create",
    Boolean(onboarding?.active && onboarding.step === 3),
  );
  const { ref: wishlistCreateRef } = useOnboardingTarget(
    "wishlist-create",
    Boolean(onboarding?.active && onboarding.step === 4),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCreate, setActiveCreate] = useState<CreateKind>(null);
  const [collectionOptions, setCollectionOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    setMenuOpen(false);
    setActiveCreate(null);
  }, [closeSignal]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setMenuOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!user) {
      setCollectionOptions([]);
      return;
    }
    let cancelled = false;
    fetchCollections({ limit: 100, sort: "name_asc" })
      .then((res) => {
        if (!cancelled) {
          setCollectionOptions(
            res.items.filter(collectionMayReceiveItems).map((c) => ({ id: c.id, name: c.name }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCollectionOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const requireAuth = useCallback(() => {
    router.push(`/login?next=${encodeURIComponent("/")}`);
  }, [router]);

  const openCreate = useCallback(
    (kind: CreateKind) => {
      setMenuOpen(false);
      if (!user) {
        requireAuth();
        return;
      }
      setActiveCreate(kind);
    },
    [user, requireAuth]
  );

  const closeModal = useCallback(() => setActiveCreate(null), []);

  const menuItemClass =
    "block w-full px-3 py-2 text-left text-sm text-kurator-fg transition-colors hover:bg-kurator-border/40";

  return (
    <>
      <div className="relative shrink-0" ref={rootRef}>
        <button
          type="button"
          onClick={() => {
            const next = !menuOpen;
            setMenuOpen(next);
            if (next) onMenuOpen();
          }}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent bg-transparent text-kurator-muted transition-colors hover:border-kurator-border hover:bg-kurator-border/50 hover:text-kurator-fg"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Create"
        >
          <Plus className="h-6 w-6" aria-hidden />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            aria-label="Create new"
            className="absolute right-0 z-50 mt-2 w-[min(14rem,calc(100vw-2rem))] rounded-xl border border-kurator-border bg-kurator-topbar py-2 shadow-dropdown"
          >
            <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-kurator-muted/55">
              Create New
            </p>
            <button
              ref={collectionCreateRef}
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                if (onboarding?.active && onboarding.step === 3) {
                  setMenuOpen(false);
                  if (!user) {
                    requireAuth();
                    return;
                  }
                  onboarding.setCollectionCreateOpen(true);
                  return;
                }
                openCreate("collection");
              }}
            >
              New Collection
            </button>
            <button
              ref={wishlistCreateRef}
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                if (onboarding?.active && onboarding.step === 4) {
                  setMenuOpen(false);
                  if (!user) {
                    requireAuth();
                    return;
                  }
                  onboarding.setWishlistCreateOpen(true);
                  return;
                }
                openCreate("wishlist");
              }}
            >
              New Wishlist
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => openCreate("hitlist")}
            >
              New Hitlist
            </button>
          </div>
        ) : null}
      </div>

      <CollectionCreateModal
        open={activeCreate === "collection"}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        onCreated={() => {
          closeModal();
          router.refresh();
        }}
      />
      <WishlistCreateModal
        open={activeCreate === "wishlist"}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        collectionOptions={collectionOptions}
        onCreated={() => {
          closeModal();
          router.refresh();
        }}
      />
      <HitlistCreateModal
        open={activeCreate === "hitlist"}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        onCreated={() => {
          closeModal();
          router.refresh();
        }}
      />
    </>
  );
}
