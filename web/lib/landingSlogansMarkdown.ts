import "server-only";

import { loadContentMarkdown, type ContentMarkdownSource } from "@/lib/contentMarkdownFromS3";
import { parseLandingSlogansFromMarkdown } from "@/lib/parseLandingSlogansMarkdown";

export type LandingSlogansSource = ContentMarkdownSource;

/**
 * Path inside the shared brand/asset bucket (`S3_BUCKET`; same vars as uploads / logos).
 * Release workflow uploads `web/content/landing-slogans.md` to this key.
 */
export const LANDING_SLOGANS_ASSET_KEY = "marketing/landing-slogans.md";

const LOCAL_RELATIVE_PATH = ["content", "landing-slogans.md"] as const;

/**
 * Loads landing hero slogans: from S3 when `S3_BUCKET` is set (same bucket as logos / uploads),
 * at {@link LANDING_SLOGANS_ASSET_KEY}; otherwise from `content/landing-slogans.md` (local dev).
 * Falls back to the bundled file when the S3 object is not uploaded yet.
 */
export async function loadLandingSlogans(): Promise<{
  slogans: string[];
  source: LandingSlogansSource;
}> {
  const { markdown, source } = await loadContentMarkdown({
    s3Key: LANDING_SLOGANS_ASSET_KEY,
    localRelativePath: LOCAL_RELATIVE_PATH,
  });

  const slogans = parseLandingSlogansFromMarkdown(markdown);
  if (slogans.length === 0) {
    throw new Error("landing-slogans.md contains no list items.");
  }

  return { slogans, source };
}
