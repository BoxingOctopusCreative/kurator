"use client";

import { Star } from "lucide-react";

const MAX = 5;

type Props = {
  value: number | null | undefined;
  onChange?: (next: number | null) => void;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
};

export function ItemStarRating({ value, onChange, size = "md", className = "", disabled }: Props) {
  const v = value == null || value < 1 ? 0 : Math.min(5, value);
  const dim = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const interactive = Boolean(onChange) && !disabled;

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role={interactive ? "radiogroup" : undefined}
      aria-label={interactive ? "Rating" : "Rating display"}
    >
      {Array.from({ length: MAX }, (_, i) => {
        const starN = i + 1;
        const filled = starN <= v;
        return (
          <button
            key={starN}
            type="button"
            disabled={!interactive}
            className={
              interactive
                ? "rounded p-0.5 text-kurator-muted transition hover:text-amber-400 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-kurator-accent disabled:opacity-50"
                : "pointer-events-none p-0.5"
            }
            aria-label={`${starN} of ${MAX} stars`}
            aria-checked={interactive ? filled : undefined}
            role={interactive ? "radio" : undefined}
            onClick={() => {
              if (!onChange) return;
              onChange(starN === v ? null : starN);
            }}
          >
            <Star
              className={`${dim} shrink-0 ${filled ? "fill-amber-400 text-amber-400" : "text-kurator-muted/80"}`}
              strokeWidth={interactive ? 1.5 : 1.25}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
