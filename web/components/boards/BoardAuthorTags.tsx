const TAG_STYLES: Record<string, string> = {
  OWNER:
    "border-amber-500/50 bg-amber-500/15 text-amber-200",
  MOD: "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
  OP: "border-kurator-accent/40 bg-kurator-accent/10 text-kurator-accent",
};

/** Role chips shown beside board thread/reply authors (OWNER, MOD, OP). */
export function BoardAuthorTags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
            TAG_STYLES[tag] ?? "border-kurator-border bg-kurator-border/20 text-kurator-muted"
          }`}
        >
          {tag}
        </span>
      ))}
    </span>
  );
}
