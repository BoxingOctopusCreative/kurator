import "server-only";

import { loadContentMarkdown, type ContentMarkdownSource } from "@/lib/contentMarkdownFromS3";

export type SitemapSource = ContentMarkdownSource;

/**
 * Path inside the shared brand/asset bucket (`S3_BUCKET`; same vars as uploads / logos).
 * Release workflow uploads `web/content/sitemap.md` to this key.
 */
export const SITEMAP_ASSET_KEY = "legal/sitemap.md";

const LOCAL_RELATIVE_PATH = ["content", "sitemap.md"] as const;

/**
 * Loads the sitemap markdown: from S3 when `S3_BUCKET` is set (same bucket as logos / uploads),
 * at {@link SITEMAP_ASSET_KEY}; otherwise from `content/sitemap.md` next to the app (local dev).
 * Falls back to the bundled file when the S3 object is not uploaded yet.
 */
export async function loadSitemapMarkdown(): Promise<{
  markdown: string;
  source: SitemapSource;
}> {
  return loadContentMarkdown({
    s3Key: SITEMAP_ASSET_KEY,
    localRelativePath: LOCAL_RELATIVE_PATH,
  });
}
