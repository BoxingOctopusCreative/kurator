/** Small label chip for a thread flair (Reddit-style). */
export function BoardFlairBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-kurator-accent/40 bg-kurator-accent/10 px-2 py-0.5 text-[11px] font-medium text-kurator-accent">
      {label}
    </span>
  );
}
