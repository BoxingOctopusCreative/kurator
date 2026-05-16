"use client";

import Link from "next/link";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const proseClassName =
  "prose prose-sm max-w-none leading-relaxed " +
  "prose-headings:font-semibold prose-headings:text-kurator-fg " +
  "prose-p:text-kurator-muted prose-li:text-kurator-muted prose-li:marker:text-kurator-muted " +
  "prose-strong:text-kurator-fg prose-a:text-kurator-accent prose-a:font-normal prose-a:no-underline hover:prose-a:underline " +
  "prose-code:text-kurator-fg prose-pre:bg-kurator-bg prose-pre:border prose-pre:border-kurator-border";

const markdownComponents: Components = {
  a({ href, children, node: _node, className, title, ...props }) {
    if (!href) {
      return (
        <span {...props} className={className}>
          {children}
        </span>
      );
    }
    const isInternal = href.startsWith("/") && !href.startsWith("//");
    const linkClass = `${className ?? ""} text-kurator-accent hover:underline`.trim();
    if (isInternal) {
      return (
        <Link href={href} className={linkClass || "text-kurator-accent hover:underline"} title={title}>
          {children}
        </Link>
      );
    }
    return (
      <a
        {...props}
        href={href}
        className={linkClass || "text-kurator-accent hover:underline"}
        title={title}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
};

type Props = {
  markdown: string;
  className?: string;
};

export function MarkdownBody({ markdown, className }: Props) {
  const text = markdown.trim();
  if (!text) return null;
  return (
    <div className={`${proseClassName}${className ? ` ${className}` : ""}`}>
      <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
    </div>
  );
}
