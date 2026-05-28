import "server-only";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseLandingSlogansFromMarkdown } from "@/lib/parseLandingSlogansMarkdown";

export type LandingSlogansSource = "s3" | "file";

/**
 * Path inside the shared brand/asset bucket (`S3_BUCKET`; same vars as uploads / logos).
 * Release workflow uploads `web/content/landing-slogans.md` to this key.
 */
export const LANDING_SLOGANS_ASSET_KEY = "marketing/landing-slogans.md";

const LOCAL_RELATIVE_PATH = ["content", "landing-slogans.md"] as const;

function trimmedEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v === "" ? undefined : v;
}

function landingSlogansS3Client(): {
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
 * Loads landing hero slogans: from S3 when `S3_BUCKET` is set (same bucket as logos / uploads),
 * at {@link LANDING_SLOGANS_ASSET_KEY}; otherwise from `content/landing-slogans.md` (local dev).
 */
export async function loadLandingSlogans(): Promise<{
  slogans: string[];
  source: LandingSlogansSource;
}> {
  const s3 = landingSlogansS3Client();
  let markdown: string;
  let source: LandingSlogansSource;

  if (!s3) {
    markdown = await markdownFromLocalFile();
    source = "file";
  } else {
    const res = await s3.client.send(
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: LANDING_SLOGANS_ASSET_KEY,
      }),
    );

    const body = res.Body;
    if (!body) {
      throw new Error("S3 returned an empty landing slogans object body.");
    }

    markdown = await body.transformToString("utf-8");
    source = "s3";
  }

  const slogans = parseLandingSlogansFromMarkdown(markdown);
  if (slogans.length === 0) {
    throw new Error("landing-slogans.md contains no list items.");
  }

  return { slogans, source };
}
