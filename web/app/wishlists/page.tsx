import type { Metadata } from "next";
import { WishlistsBrowser } from "@/components/WishlistsBrowser";
import { parseWishlistsListRecord } from "@/lib/wishlistsListUrl";

export const metadata: Metadata = {
  title: "Wishlists",
};

export default async function WishlistsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const initialFilters = parseWishlistsListRecord(sp);
  return <WishlistsBrowser initialFilters={initialFilters} />;
}
