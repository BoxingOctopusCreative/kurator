import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectionsBrowser } from "@/components/CollectionsBrowser";

export const metadata: Metadata = {
  title: "Collections",
};

export default function CollectionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-kurator-muted">Loading…</p>}>
      <CollectionsBrowser />
    </Suspense>
  );
}
