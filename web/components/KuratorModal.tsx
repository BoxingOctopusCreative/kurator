"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const MODAL_MOTION_MS = 500;

/** Matches `kurator-shelf-fly-in` “from” keyframe for pre-enter panel state. */
const MODAL_PANEL_ENTER_FROM =
  "opacity-0 translate-y-2.5 scale-[0.985]";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after the close animation finishes and the modal unmounts. */
  onExited?: () => void;
  children: ReactNode;
  title?: string;
  titleId?: string;
  /** When false, omit the default title row (custom header in children). Default: true if `title` is set. */
  showHeader?: boolean;
  dismissible?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  labelledBy?: string;
  ariaLabel?: string;
};

export function KuratorModal({
  open,
  onOpenChange,
  onExited,
  children,
  title,
  titleId,
  showHeader,
  dismissible = true,
  overlayClassName = "bg-transparent",
  panelClassName = "",
  labelledBy,
  ariaLabel,
}: Props) {
  const [present, setPresent] = useState(open);
  const [exiting, setExiting] = useState(false);
  const [enterReady, setEnterReady] = useState(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  const motionMs = prefersReducedMotion() ? 0 : MODAL_MOTION_MS;
  const motionEnabled = motionMs > 0;

  useLayoutEffect(() => {
    if (open) {
      setPresent(true);
      setExiting(false);
    }
  }, [open]);

  useEffect(() => {
    if (open || !present) return;
    setExiting(true);
    setEnterReady(false);
    const t = window.setTimeout(() => {
      setPresent(false);
      setExiting(false);
      onExitedRef.current?.();
    }, motionMs);
    return () => clearTimeout(t);
  }, [open, present, motionMs]);

  useLayoutEffect(() => {
    if (!present || exiting || !motionEnabled) {
      setEnterReady(false);
      return;
    }
    setEnterReady(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEnterReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [present, exiting, motionEnabled]);

  const requestClose = useCallback(() => {
    if (!dismissible || exiting) return;
    onOpenChange(false);
  }, [dismissible, exiting, onOpenChange]);

  useEffect(() => {
    if (!present || exiting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present, exiting, requestClose]);

  if (!present) return null;

  const panelMotion = exiting
    ? "animate-modal-fly-out"
    : enterReady || !motionEnabled
      ? "animate-modal-fly-in"
      : MODAL_PANEL_ENTER_FROM;
  const backdropMotion = exiting
    ? "animate-modal-backdrop-out"
    : enterReady || !motionEnabled
      ? "animate-modal-backdrop-in"
      : "opacity-0";
  const showTitleHeader = showHeader ?? Boolean(title?.trim());

  const tree = (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayClassName} ${backdropMotion}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          labelledBy ?? (showTitleHeader && titleId ? titleId : undefined)
        }
        aria-label={ariaLabel}
        className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-kurator-border bg-kurator-surface p-5 shadow-dropdown ${panelMotion} ${panelClassName}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showTitleHeader && title ? (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id={titleId} className="kurator-panel-title text-kurator-fg">
              {title}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg p-2 text-kurator-muted transition-colors hover:bg-kurator-border/40 hover:text-kurator-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
              aria-label="Close"
            >
              <X className="h-5 w-5 shrink-0" aria-hidden />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );

  if (typeof document === "undefined") return tree;
  return createPortal(tree, document.body);
}
