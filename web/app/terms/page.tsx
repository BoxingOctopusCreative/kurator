import type { Metadata } from "next";
import { preload } from "react-dom";
import { LegalMarkdownDocument } from "@/components/LegalMarkdownDocument";
import { fetchUnsplashPageBanner } from "@/lib/unsplash-page-banner.server";
import { loadTermsOfUseMarkdown } from "@/lib/termsOfUseMarkdown";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms governing your use of Kurator.",
};

export const dynamic = "force-dynamic";

export default async function TermsOfUsePage() {
  const [{ markdown }, initialBackground] = await Promise.all([
    loadTermsOfUseMarkdown(),
    fetchUnsplashPageBanner("/terms"),
  ]);

  if (initialBackground?.url) {
    preload(initialBackground.url, { as: "image", fetchPriority: "high" });
  }

  return (
    <LegalMarkdownDocument
      bannerPath="/terms"
      markdown={markdown}
      initialBackground={initialBackground}
    />
  );
}
