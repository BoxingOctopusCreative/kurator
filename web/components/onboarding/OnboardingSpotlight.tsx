"use client";

import { useLayoutEffect, useState } from "react";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

type Props = {
  target: HTMLElement | null;
};

export function OnboardingSpotlight({ target }: Props) {
  const [hole, setHole] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!target) {
      setHole(null);
      return;
    }
    const update = () => {
      const r = target.getBoundingClientRect();
      setHole({
        top: Math.max(0, r.top - PAD),
        left: Math.max(0, r.left - PAD),
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(target);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [target]);

  if (!hole) {
    return (
      <div
        className="pointer-events-auto fixed inset-0 z-[200] bg-black/65"
        aria-hidden
      />
    );
  }

  const { top, left, width, height } = hole;
  const bottom = top + height;
  const right = left + width;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[200]" aria-hidden>
      <div className="absolute left-0 right-0 top-0 bg-black/65" style={{ height: top }} />
      <div className="absolute left-0 bg-black/65" style={{ top, width: left, height }} />
      <div className="absolute right-0 bg-black/65" style={{ top, left: right, height }} />
      <div className="absolute left-0 right-0 bottom-0 bg-black/65" style={{ top: bottom }} />
      <div
        className="absolute rounded-xl ring-2 ring-kurator-accent ring-offset-2 ring-offset-transparent"
        style={{ top, left, width, height }}
      />
    </div>
  );
}
