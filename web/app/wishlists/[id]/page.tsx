import type { Metadata } from "next";
import { WishlistDetailClient } from "./WishlistDetailClient";

export const metadata: Metadata = {
  title: "Wishlist",
};

export default function WishlistDetailPage() {
  return <WishlistDetailClient />;
}
