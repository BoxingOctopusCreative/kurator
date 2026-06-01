"use client";

import { KuratorModal } from "@/components/KuratorModal";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** `aria-labelledby` / `id` on the dialog title (must be unique per page). */
  titleId?: string;
  children: ReactNode;
};

export function WishlistSettingsModal({
  open,
  onOpenChange,
  title = "Wishlist Settings",
  titleId = "wishlist-settings-dialog-title",
  children,
}: Props) {
  return (
    <KuratorModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      titleId={titleId}
    >
      {children}
    </KuratorModal>
  );
}
