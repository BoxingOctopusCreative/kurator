"use client";

import Link from "next/link";
import { BarcodeScannerPlaceholder } from "@/components/BarcodeScannerPlaceholder";

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold text-kurator-fg">Scan barcode</h1>
      <p className="mt-1 text-sm text-kurator-muted">
        Early preview: camera scanning is wired up, but matching barcodes to titles is still on the roadmap. For
        now, add items from the{" "}
        <Link href="/items/add" className="text-kurator-accent hover:underline">
          Add item
        </Link>{" "}
        page and search by title there.
      </p>
      <div className="mt-8">
        <BarcodeScannerPlaceholder />
      </div>
    </div>
  );
}
