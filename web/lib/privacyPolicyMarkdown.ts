import "server-only";

import { loadContentMarkdown, type ContentMarkdownSource } from "@/lib/contentMarkdownFromS3";

export type PrivacyPolicySource = ContentMarkdownSource;

/**
 * Path inside the shared brand/asset bucket (`S3_BUCKET`; same vars as uploads / logos).
 * Release workflow uploads `web/content/privacy-policy.md` to this key.
 */
export const PRIVACY_POLICY_ASSET_KEY = "legal/privacy-policy.md";

const LOCAL_RELATIVE_PATH = ["content", "privacy-policy.md"] as const;

/**
 * Loads the privacy policy markdown: from S3 when `S3_BUCKET` is set (same bucket as logos / uploads),
 * at {@link PRIVACY_POLICY_ASSET_KEY}; otherwise from `content/privacy-policy.md` next to the app (local dev).
 * Falls back to the bundled file when the S3 object is not uploaded yet.
 */
export async function loadPrivacyPolicyMarkdown(): Promise<{
  markdown: string;
  source: PrivacyPolicySource;
}> {
  return loadContentMarkdown({
    s3Key: PRIVACY_POLICY_ASSET_KEY,
    localRelativePath: LOCAL_RELATIVE_PATH,
  });
}
