import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Add item",
};

export default function AddItemLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="text-sm text-kurator-muted">Loading…</p>}>{children}</Suspense>;
}
