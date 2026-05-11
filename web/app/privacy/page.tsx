import type { Metadata } from "next";
import Link from "next/link";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { loadPrivacyPolicyMarkdown } from "@/lib/privacyPolicyMarkdown";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Kurator handles your data.",
};

export const dynamic = "force-dynamic";

const proseClassName =
  "prose prose-sm max-w-none leading-relaxed " +
  "prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-kurator-fg " +
  "prose-h1:text-2xl prose-h1:md:text-3xl prose-h1:mb-2 " +
  "prose-h2:mt-10 prose-h2:text-base " +
  "prose-p:text-kurator-muted prose-li:text-kurator-muted prose-li:marker:text-kurator-muted " +
  "prose-strong:text-kurator-fg prose-a:text-kurator-accent prose-a:font-normal prose-a:no-underline hover:prose-a:underline " +
  "prose-hr:border-kurator-border";

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

export default async function PrivacyPolicyPage() {
  const { markdown } = await loadPrivacyPolicyMarkdown();

  return (
    <div className="mx-auto max-w-2xl">
      <article className={proseClassName}>
        <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
      </article>

      <p className="mt-12 text-sm text-kurator-muted">
        <Link href="/" className="text-kurator-accent hover:underline">
          Back to Home
        </Link>
      </p>
    </div>
  );
}
