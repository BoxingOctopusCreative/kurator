"use client";

import Link from "next/link";
import { BarcodeScannerPlaceholder } from "@/components/BarcodeScannerPlaceholder";

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold text-kurator-fg">Scan barcode</h1>
      <p className="mt-1 text-sm text-kurator-muted">
        MVP placeholder using <code className="text-kurator-accent">html5-qrcode</code>. Title-based lookup for
        music, games, and books runs from the{" "}
        <Link href="/items/add" className="text-kurator-accent hover:underline">
          Add item
        </Link>{" "}
        page via <code className="text-kurator-accent">/api/v1/metadata/lookup</code>.
      </p>
      <div className="mt-8">
        <BarcodeScannerPlaceholder />
      </div>
    </div>
  );
}
