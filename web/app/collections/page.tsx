import type { Metadata } from "next";
import { CollectionsBrowser } from "@/components/CollectionsBrowser";
import { parseCollectionsListRecord } from "@/lib/collectionsListUrl";

export const metadata: Metadata = {
  title: "Collections",
};

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams != null ? await searchParams : {};
  const initialFilters = parseCollectionsListRecord(sp);
  return <CollectionsBrowser basePath="/collections" initialFilters={initialFilters} />;
}
