/** True when the object is missing (not uploaded yet, wrong key, or wrong bucket). */
export function isS3MissingObjectError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const e = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    e.name === "NoSuchKey" ||
    e.Code === "NoSuchKey" ||
    e.name === "NotFound" ||
    e.Code === "NotFound" ||
    e.$metadata?.httpStatusCode === 404
  );
}
