import type { Metadata } from "next";
import { preload } from "react-dom";
import { LegalMarkdownDocument } from "@/components/LegalMarkdownDocument";
import { fetchUnsplashPageBanner } from "@/lib/unsplash-page-banner.server";
import { loadSitemapMarkdown } from "@/lib/sitemapMarkdown";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "Index of main Kurator pages.",
};

export const dynamic = "force-dynamic";

export default async function SitemapPage() {
  const [{ markdown }, initialBackground] = await Promise.all([
    loadSitemapMarkdown(),
    fetchUnsplashPageBanner("/sitemap"),
  ]);

  if (initialBackground?.url) {
    preload(initialBackground.url, { as: "image", fetchPriority: "high" });
  }

  return (
    <LegalMarkdownDocument
      bannerPath="/sitemap"
      markdown={markdown}
      initialBackground={initialBackground}
    />
  );
}
