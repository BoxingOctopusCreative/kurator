import "server-only";

import { loadContentMarkdown, type ContentMarkdownSource } from "@/lib/contentMarkdownFromS3";

export type BillingPlansSource = ContentMarkdownSource;

/**
 * Path inside the shared brand/asset bucket (`S3_BUCKET`; same vars as uploads / logos).
 * Release workflow uploads `web/content/billing-plans.md` to this key.
 */
export const BILLING_PLANS_ASSET_KEY = "marketing/billing-plans.md";

const LOCAL_RELATIVE_PATH = ["content", "billing-plans.md"] as const;

/**
 * Loads billing plan copy for `/settings/billing`: from S3 when `S3_BUCKET` is set (same bucket as logos / uploads),
 * at {@link BILLING_PLANS_ASSET_KEY}; otherwise from `content/billing-plans.md` (local dev).
 * Falls back to the bundled file when the S3 object is not uploaded yet.
 */
export async function loadBillingPlansMarkdown(): Promise<{
  markdown: string;
  source: BillingPlansSource;
}> {
  return loadContentMarkdown({
    s3Key: BILLING_PLANS_ASSET_KEY,
    localRelativePath: LOCAL_RELATIVE_PATH,
  });
}
