import { safeImageSrcUrl } from "@/lib/safeUrl";

type Props = {
  url: string | null;
  className?: string;
  alt: string;
};

export function ItemCoverImage({ url, className, alt }: Props) {
  const src = safeImageSrcUrl(url);
  if (!src) {
    return (
      <div
        className={`flex h-full w-full min-h-0 items-center justify-center bg-kurator-border/30 p-1 text-center text-[9px] leading-tight text-kurator-muted/70 ${className ?? ""}`}
        aria-hidden
      >
        No cover
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}
