"use client";

import Link from "next/link";
import { GripVertical } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ItemCoverImage } from "@/components/ItemCoverImage";
import { MarkdownBody } from "@/components/MarkdownBody";
import type { Category } from "@/lib/api";
import { categoryLabel } from "@/lib/categoryLabels";

const SM_MAX_PX = 639;

function HitlistEntryMarkdownDescription({ markdown }: { markdown: string }) {
  const [expanded, setExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const checkOverflow = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const mobile = window.matchMedia(`(max-width: ${SM_MAX_PX}px)`).matches;
    if (!mobile) {
      setShowToggle(false);
      return;
    }
    if (expanded) {
      setShowToggle(true);
      return;
    }
    setShowToggle(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  useEffect(() => {
    setExpanded(false);
  }, [markdown]);

  useLayoutEffect(() => {
    checkOverflow();
  }, [checkOverflow, markdown]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${SM_MAX_PX}px)`);
    const onMq = () => {
      setExpanded(false);
      requestAnimationFrame(() => checkOverflow());
    };
    mq.addEventListener("change", onMq);
    const el = bodyRef.current;
    const ro = new ResizeObserver(() => checkOverflow());
    if (el) ro.observe(el);
    return () => {
      mq.removeEventListener("change", onMq);
      ro.disconnect();
    };
  }, [checkOverflow]);

  return (
    <>
      <div
        ref={bodyRef}
        className={
          expanded
            ? "max-sm:overflow-visible"
            : "max-sm:line-clamp-3 max-sm:overflow-hidden"
        }
      >
        <MarkdownBody markdown={markdown} />
      </div>
      {showToggle ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-kurator-accent hover:underline sm:hidden focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "See less" : "… See more"}
        </button>
      ) : null}
    </>
  );
}

type Props = {
  /** 1-based position in the hitlist */
  rank: number;
  /** When false, rank is hidden (unordered hitlist). Default true. */
  showNumbers?: boolean;
  /** When false, the card is wrapped in a div (parent supplies the list item element). Default true. */
  asListItem?: boolean;
  /** Props for the drag handle control (e.g. from @dnd-kit sortable). */
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  cover: string | null;
  title: string;
  category: Category | null;
  description?: string | null;
  itemId: string | null;
  /** Rendered under the title row (e.g. “Add this to my account”). */
  belowTitle?: ReactNode;
  actions?: ReactNode;
  cardClassName?: string;
};

export function HitlistEntryRow({
  rank,
  showNumbers = true,
  asListItem = true,
  dragHandleProps,
  cover,
  title,
  category,
  description,
  itemId,
  belowTitle,
  actions,
  cardClassName,
}: Props) {
  const card = (
    <div
      className={`flex gap-3 rounded-lg border border-kurator-border bg-kurator-surface px-3 py-3 shadow-surface sm:gap-4 ${cardClassName ?? ""}`}
    >
        {dragHandleProps ? (
          <button
            type="button"
            className="-ms-1 mt-0.5 inline-flex h-8 w-8 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-md text-kurator-muted hover:bg-kurator-border/30 hover:text-kurator-fg active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kurator-accent"
            aria-label="Drag to reorder"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        ) : null}
        {showNumbers ? (
          <span
            className="w-7 shrink-0 pt-0.5 text-end text-sm font-medium tabular-nums text-kurator-muted select-none"
            aria-hidden
          >
            {rank}.
          </span>
        ) : null}
        <div className="relative h-18 w-12 shrink-0 overflow-hidden rounded border border-kurator-border/60 bg-kurator-bg">
          <ItemCoverImage
            url={cover}
            alt={`Cover for ${title}`}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={
              description?.trim()
                ? "flex min-w-0 flex-col items-stretch gap-3 sm:grid sm:grid-cols-[12.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:gap-y-0"
                : "flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:gap-4"
            }
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="kurator-item-title text-base leading-snug font-medium text-kurator-fg">{title}</h2>
                {category ? (
                  <span className="inline-flex shrink-0 rounded-full bg-kurator-border/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-kurator-muted">
                    {categoryLabel(category)}
                  </span>
                ) : null}
              </div>
              {belowTitle ? <div>{belowTitle}</div> : null}
            </div>
            {description?.trim() ? (
              <div className="min-w-0 w-full border-t border-kurator-border/60 pt-3 text-xs text-kurator-muted sm:border-t-0 sm:border-l sm:pt-0 sm:ps-4 [&_.prose-p]:my-0 [&_.prose-p]:text-kurator-muted [&_.prose-p]:leading-snug">
                <HitlistEntryMarkdownDescription markdown={description} />
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-start gap-2 sm:flex-row sm:items-center">
          {itemId ? (
            <Link
              href={`/items/${itemId}`}
              className="rounded-lg border border-kurator-border px-3 py-1.5 text-xs font-medium text-kurator-accent hover:border-kurator-accent/60"
            >
              Open
            </Link>
          ) : null}
          {actions}
        </div>
      </div>
  );
  if (asListItem) {
    return <li>{card}</li>;
  }
  return card;
}
