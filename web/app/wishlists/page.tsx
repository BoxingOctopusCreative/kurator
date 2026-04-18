import type { Metadata } from "next";
import { Suspense } from "react";
import { WishlistsBrowser } from "@/components/WishlistsBrowser";

export const metadata: Metadata = {
  title: "Wishlists",
};

export default function WishlistsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-kurator-muted">Loading…</p>}>
      <WishlistsBrowser />
    </Suspense>
  );
}
