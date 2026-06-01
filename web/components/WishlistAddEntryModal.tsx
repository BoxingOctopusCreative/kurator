"use client";

import { KuratorModal } from "@/components/KuratorModal";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
};

export function WishlistAddEntryModal({
  open,
  onOpenChange,
  title = "Add to Wishlist",
  children,
}: Props) {
  return (
    <KuratorModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      titleId="wishlist-add-entry-dialog-title"
      overlayClassName="bg-black/50"
    >
      {children}
    </KuratorModal>
  );
}
