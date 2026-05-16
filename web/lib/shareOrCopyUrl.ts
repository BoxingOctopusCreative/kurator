export type ShareOrCopyUrlResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Uses the Web Share API when available; otherwise copies the URL to the clipboard.
 * User-dismissed share sheets return `cancelled` and do not fall back to copy.
 */
export async function shareOrCopyUrl(
  url: string,
  meta?: { title?: string; text?: string },
): Promise<ShareOrCopyUrlResult> {
  if (typeof navigator === "undefined") {
    return "failed";
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        ...(meta?.title ? { title: meta.title } : {}),
        ...(meta?.text ? { text: meta.text } : {}),
        url,
      });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return "cancelled";
      }
      // Invalid share target, not allowed, etc. — try clipboard.
    }
  }

  try {
    if (!navigator.clipboard?.writeText) {
      return "failed";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
