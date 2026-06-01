import Link from "next/link";
import { LegalDocumentPageShell } from "@/components/LegalDocumentPageShell";
import { LegalMarkdownArticle } from "@/components/LegalMarkdownArticle";
import type { UnsplashBackgroundPayload } from "@/lib/unsplash-background.types";

type Props = {
  bannerPath: "/privacy" | "/terms" | "/sitemap";
  markdown: string;
  initialBackground: UnsplashBackgroundPayload | null;
};

export function LegalMarkdownDocument({ bannerPath, markdown, initialBackground }: Props) {
  return (
    <LegalDocumentPageShell bannerPath={bannerPath} initialBackground={initialBackground}>
      <LegalMarkdownArticle markdown={markdown} />
      <p className="mt-12 text-sm text-kurator-muted">
        <Link href="/" className="text-kurator-accent hover:underline">
          Back to Home
        </Link>
      </p>
    </LegalDocumentPageShell>
  );
}
