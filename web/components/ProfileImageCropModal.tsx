"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  drawCroppedToCanvas,
  getCroppedImageBlob,
  loadImage,
  PROFILE_AVATAR_EXPORT,
  PROFILE_AVATAR_PREVIEW,
  PROFILE_BANNER_EXPORT,
  PROFILE_BANNER_PREVIEW,
} from "@/lib/crop-image";

type Kind = "avatar" | "banner";

type Props = {
  kind: Kind;
  imageObjectUrl: string;
  onClose: () => void;
  /** Called with a JPEG file ready for upload. */
  onComplete: (file: File) => void | Promise<void>;
};

const AVATAR_ASPECT = 1;
const BANNER_ASPECT = 3;

export function ProfileImageCropModal({ kind, imageObjectUrl, onClose, onComplete }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setSourceImage(null);
    loadImage(imageObjectUrl)
      .then((img) => {
        if (!cancelled) setSourceImage(img);
      })
      .catch(() => {
        if (!cancelled) setSourceImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [imageObjectUrl]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !sourceImage || !croppedAreaPixels) {
      return;
    }
    const preview = kind === "avatar" ? PROFILE_AVATAR_PREVIEW : PROFILE_BANNER_PREVIEW;
    try {
      drawCroppedToCanvas(canvas, sourceImage, croppedAreaPixels, preview.width, preview.height, {
        whiteBackground: true,
      });
    } catch {
      /* ignore preview draw errors */
    }
  }, [croppedAreaPixels, kind, sourceImage, crop, zoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handleApply() {
    if (!croppedAreaPixels) {
      setError("Adjust the crop area, then try again.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const out = kind === "avatar" ? PROFILE_AVATAR_EXPORT : PROFILE_BANNER_EXPORT;
      const blob = await getCroppedImageBlob(imageObjectUrl, croppedAreaPixels, out.width, out.height);
      const name = kind === "avatar" ? "avatar.jpg" : "banner.jpg";
      const file = new File([blob], name, { type: "image/jpeg" });
      await onComplete(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare image.");
    } finally {
      setBusy(false);
    }
  }

  const title = kind === "avatar" ? "Adjust profile photo" : "Adjust banner";
  const subtitle =
    kind === "avatar"
      ? "Drag to reposition, use the slider to zoom. Export is a 512×512 square."
      : "Wide banner for your public profile. Export is 1800×600 (3:1).";

  const previewW = kind === "avatar" ? PROFILE_AVATAR_PREVIEW.width : PROFILE_BANNER_PREVIEW.width;
  const previewH = kind === "avatar" ? PROFILE_AVATAR_PREVIEW.height : PROFILE_BANNER_PREVIEW.height;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-modal-title"
        className="flex max-h-[min(92vh,800px)] w-full max-w-3xl flex-col rounded-xl border border-kurator-border bg-kurator-bg shadow-dropdown"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-kurator-border px-4 py-3">
          <h2 id="crop-modal-title" className="text-base font-semibold text-kurator-fg">
            {title}
          </h2>
          <p className="mt-1 text-xs text-kurator-muted">{subtitle}</p>
        </div>

        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start">
          <div className="relative min-h-0 min-w-0 flex-1">
            <div className="relative h-56 bg-black sm:h-64 md:h-72">
              <Cropper
                image={imageObjectUrl}
                crop={crop}
                zoom={zoom}
                aspect={kind === "avatar" ? AVATAR_ASPECT : BANNER_ASPECT}
                cropShape={kind === "avatar" ? "round" : "rect"}
                showGrid={false}
                restrictPosition
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-2 md:w-[200px] md:border-l md:border-kurator-border md:pl-4">
            <span className="text-xs font-medium text-kurator-muted">Preview</span>
            <p className="text-center text-[11px] leading-snug text-kurator-muted/90">
              How it will look after upload (same crop, smaller size).
            </p>
            <div
              className={
                kind === "avatar"
                  ? "relative overflow-hidden rounded-full bg-kurator-bg ring-2 ring-kurator-border"
                  : "relative overflow-hidden rounded-lg bg-kurator-bg ring-2 ring-kurator-border"
              }
              style={{ width: previewW, height: previewH }}
            >
              <canvas
                ref={previewCanvasRef}
                className="block h-full w-full object-cover"
                width={previewW}
                height={previewH}
                aria-hidden
              />
              {(!sourceImage || !croppedAreaPixels) && (
                <div className="absolute inset-0 flex items-center justify-center bg-kurator-surface/90 px-2 text-center text-[11px] leading-snug text-kurator-muted">
                  {!sourceImage ? "Loading image…" : "Move or zoom to update preview"}
                </div>
              )}
            </div>
            <p className="text-[10px] text-kurator-muted/80">
              {kind === "avatar" ? "512×512 JPEG" : "1800×600 JPEG"}
            </p>
          </div>
        </div>

        <div className="space-y-3 border-t border-kurator-border px-4 py-3">
          <label className="flex items-center gap-3 text-xs text-kurator-muted">
            <span className="w-12 shrink-0">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="min-w-0 flex-1 accent-kurator-accent"
              disabled={busy}
            />
          </label>
          {error ? (
            <p className="text-xs text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => !busy && onClose()}
              className="rounded-lg border border-kurator-border px-3 py-2 text-sm text-kurator-fg hover:bg-kurator-surface disabled:opacity-50"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={busy}
              className="rounded-lg bg-kurator-accent px-3 py-2 text-sm font-medium text-kurator-onAccent hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Preparing…" : "Apply & Upload"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
