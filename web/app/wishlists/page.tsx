import type { Metadata } from "next";
import { WishlistsBrowser } from "@/components/WishlistsBrowser";

export const metadata: Metadata = {
  title: "Wishlists",
};

export default function WishlistsPage() {
  return <WishlistsBrowser />;
}
