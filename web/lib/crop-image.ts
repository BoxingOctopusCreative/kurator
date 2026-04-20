/** Pixel crop in natural image coordinates (matches react-easy-crop’s croppedAreaPixels). */
export type CropAreaPixels = { x: number; y: number; width: number; height: number };

/** Loads an image for cropping / preview (blob URLs do not set crossOrigin). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("Failed to load image")));
    if (src.startsWith("http://") || src.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
    img.src = src;
  });
}

/** Snap crop to image bounds and integer pixels for canvas. */
function normalizeCrop(img: HTMLImageElement, area: CropAreaPixels): CropAreaPixels {
  const x = Math.max(0, Math.floor(area.x));
  const y = Math.max(0, Math.floor(area.y));
  const w = Math.max(1, Math.min(Math.ceil(area.width), img.naturalWidth - x));
  const h = Math.max(1, Math.min(Math.ceil(area.height), img.naturalHeight - y));
  return { x, y, width: w, height: h };
}

/**
 * Draws the cropped region of `image` onto `canvas` at outputWidth × outputHeight (same math as upload export).
 */
export function drawCroppedToCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  cropPixels: CropAreaPixels,
  outputWidth: number,
  outputHeight: number,
  opts?: { whiteBackground?: boolean },
): void {
  const crop = normalizeCrop(image, cropPixels);
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context");
  }
  if (opts?.whiteBackground) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputWidth, outputHeight);
  }
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );
}

/**
 * Renders the cropped region to a canvas and encodes as JPEG (or WebP) at output dimensions.
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  cropPixels: CropAreaPixels,
  outputWidth: number,
  outputHeight: number,
  mimeType: "image/jpeg" | "image/webp" = "image/jpeg",
  quality = 0.9,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  drawCroppedToCanvas(canvas, image, cropPixels, outputWidth, outputHeight, {
    whiteBackground: mimeType === "image/jpeg",
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode image"));
      },
      mimeType,
      quality,
    );
  });
}

/** Output sizes after crop (keeps uploads small and predictable). */
export const PROFILE_AVATAR_EXPORT = { width: 512, height: 512 } as const;
export const PROFILE_BANNER_EXPORT = { width: 1800, height: 600 } as const; // 3:1

/** On-screen preview dimensions (same aspect ratio as export). */
export const PROFILE_AVATAR_PREVIEW = { width: 168, height: 168 } as const;
export const PROFILE_BANNER_PREVIEW = { width: 360, height: 120 } as const; // 3:1
