import "server-only";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isS3MissingObjectError } from "@/lib/contentMarkdownS3Errors";

export { isS3MissingObjectError } from "@/lib/contentMarkdownS3Errors";

export type ContentMarkdownSource = "s3" | "file";

function trimmedEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v === "" ? undefined : v;
}

export function createContentMarkdownS3Client(): {
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

/**
 * Loads markdown from S3 when configured; falls back to `content/<file>.md` in the app tree
 * when the bucket object is missing (e.g. before the next release upload).
 */
export async function loadContentMarkdown(options: {
  s3Key: string;
  localRelativePath: readonly string[];
}): Promise<{ markdown: string; source: ContentMarkdownSource }> {
  const localPath = path.join(process.cwd(), ...options.localRelativePath);

  async function fromLocalFile(): Promise<string> {
    return readFile(localPath, "utf8");
  }

  const s3 = createContentMarkdownS3Client();
  if (!s3) {
    return { markdown: await fromLocalFile(), source: "file" };
  }

  try {
    const res = await s3.client.send(
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: options.s3Key,
      }),
    );

    const body = res.Body;
    if (!body) {
      throw new Error(`S3 returned an empty object body for ${options.s3Key}.`);
    }

    const markdown = await body.transformToString("utf-8");
    return { markdown, source: "s3" };
  } catch (err) {
    if (isS3MissingObjectError(err)) {
      return { markdown: await fromLocalFile(), source: "file" };
    }
    throw err;
  }
}
