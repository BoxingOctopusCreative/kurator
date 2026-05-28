"use client";

import { useEffect, useState } from "react";

const DISPLAY_MS = 5_000;
const FADE_MS = 600;

type Props = {
  slogans: string[];
  className?: string;
};

export function LandingRotatingSlogans({ slogans, className = "" }: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion || slogans.length <= 1) {
      return;
    }

    let fadeTimeout: ReturnType<typeof setTimeout> | undefined;
    let cycleTimeout: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      cycleTimeout = setTimeout(() => {
        setVisible(false);
        fadeTimeout = setTimeout(() => {
          setIndex((i) => (i + 1) % slogans.length);
          setVisible(true);
          scheduleNext();
        }, FADE_MS);
      }, DISPLAY_MS);
    };

    scheduleNext();

    return () => {
      clearTimeout(fadeTimeout);
      clearTimeout(cycleTimeout);
    };
  }, [reducedMotion, slogans.length]);

  const slogan = slogans[index] ?? slogans[0] ?? "";

  if (!slogan) {
    return null;
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className={`min-h-16 text-lg leading-relaxed text-kurator-muted transition-opacity ease-in-out ${className}`.trim()}
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: reducedMotion ? "0ms" : `${FADE_MS}ms`,
      }}
    >
      {slogan}
    </p>
  );
}
