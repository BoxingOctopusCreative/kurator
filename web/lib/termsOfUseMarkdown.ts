import "server-only";

import { loadContentMarkdown, type ContentMarkdownSource } from "@/lib/contentMarkdownFromS3";

export type TermsOfUseSource = ContentMarkdownSource;

/**
 * Path inside the shared brand/asset bucket (`S3_BUCKET`; same vars as uploads / logos).
 * Release workflow uploads `web/content/terms-of-use.md` to this key.
 */
export const TERMS_OF_USE_ASSET_KEY = "legal/terms-of-use.md";

const LOCAL_RELATIVE_PATH = ["content", "terms-of-use.md"] as const;

/**
 * Loads the terms of use markdown: from S3 when `S3_BUCKET` is set (same bucket as logos / uploads),
 * at {@link TERMS_OF_USE_ASSET_KEY}; otherwise from `content/terms-of-use.md` next to the app (local dev).
 * Falls back to the bundled file when the S3 object is not uploaded yet.
 */
export async function loadTermsOfUseMarkdown(): Promise<{
  markdown: string;
  source: TermsOfUseSource;
}> {
  return loadContentMarkdown({
    s3Key: TERMS_OF_USE_ASSET_KEY,
    localRelativePath: LOCAL_RELATIVE_PATH,
  });
}
