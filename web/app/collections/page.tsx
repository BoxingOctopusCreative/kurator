import type { Metadata } from "next";
import { CollectionsBrowser } from "@/components/CollectionsBrowser";

export const metadata: Metadata = {
  title: "Collections",
};

export default function CollectionsPage() {
  return <CollectionsBrowser />;
}
