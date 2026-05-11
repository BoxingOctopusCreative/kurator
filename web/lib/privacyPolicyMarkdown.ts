import "server-only";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type PrivacyPolicySource = "s3" | "file";

/**
 * Path inside the shared brand/asset bucket (`S3_BUCKET`; same vars as uploads / logos).
 * Release workflow uploads `web/content/privacy-policy.md` to this key.
 */
export const PRIVACY_POLICY_ASSET_KEY = "legal/privacy-policy.md";

const LOCAL_RELATIVE_PATH = ["content", "privacy-policy.md"] as const;

function trimmedEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v === "" ? undefined : v;
}

function privacyPolicyS3Client(): {
  bucket: string;
  client: S3Client;
} | null {
  const bucket = trimmedEnv("S3_BUCKET");
  if (!bucket) {
    return null;
  }

  const endpoint = trimmedEnv("S3_ENDPOINT");
  const region = trimmedEnv("S3_REGION") ?? "us-east-1";
  const accessKeyId = trimmedEnv("S3_ACCESS_KEY_ID") ?? trimmedEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = trimmedEnv("S3_SECRET_ACCESS_KEY") ?? trimmedEnv("AWS_SECRET_ACCESS_KEY");

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_BUCKET is set but credentials are missing. Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (or AWS_* equivalents).",
    );
  }

  const forceEnv = trimmedEnv("S3_FORCE_PATH_STYLE");
  const forcePathStyle =
    forceEnv === "true" || (!!endpoint && forceEnv !== "false");

  const client = new S3Client({
    region,
    ...(endpoint ? { endpoint } : {}),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle,
  });

  return { bucket, client };
}

async function markdownFromLocalFile(): Promise<string> {
  const markdownPath = path.join(process.cwd(), ...LOCAL_RELATIVE_PATH);
  return readFile(markdownPath, "utf8");
}

/**
 * Loads the privacy policy markdown: from S3 when `S3_BUCKET` is set (same bucket as logos / uploads),
 * at {@link PRIVACY_POLICY_ASSET_KEY}; otherwise from `content/privacy-policy.md` next to the app (local dev).
 */
export async function loadPrivacyPolicyMarkdown(): Promise<{
  markdown: string;
  source: PrivacyPolicySource;
}> {
  const s3 = privacyPolicyS3Client();
  if (!s3) {
    const markdown = await markdownFromLocalFile();
    return { markdown, source: "file" };
  }

  const res = await s3.client.send(
    new GetObjectCommand({
      Bucket: s3.bucket,
      Key: PRIVACY_POLICY_ASSET_KEY,
    }),
  );

  const body = res.Body;
  if (!body) {
    throw new Error("S3 returned an empty privacy policy object body.");
  }

  const markdown = await body.transformToString("utf-8");
  return { markdown, source: "s3" };
}
