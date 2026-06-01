import Link from "next/link";

type Props = {
  className?: string;
  linkClassName?: string;
  activeLinkClassName?: string;
  termsActive?: boolean;
  privacyActive?: boolean;
  sitemapActive?: boolean;
  /** e.g. collapse the app sidebar when a link is opened in-app. */
  onLinkClick?: () => void;
  /** Marketing/auth footers use a new tab; in-app chrome links navigate in the same tab. */
  openInNewTab?: boolean;
};

const newTabLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

function linkClass(
  active: boolean | undefined,
  linkClassName: string,
  activeLinkClassName: string | undefined,
): string {
  if (active && activeLinkClassName) {
    return activeLinkClassName;
  }
  return linkClassName;
}

/** Terms of Use, Privacy Policy, and Sitemap links shown together. */
export function LegalPolicyLinks({
  className = "text-center text-xs text-kurator-muted",
  linkClassName = "text-kurator-accent/90 hover:underline",
  activeLinkClassName,
  termsActive,
  privacyActive,
  sitemapActive,
  onLinkClick,
  openInNewTab = true,
}: Props) {
  const sepClass = activeLinkClassName ? "mx-0.5 shrink-0 text-kurator-border" : "mx-1.5 shrink-0 text-kurator-border";
  const tabProps = openInNewTab ? newTabLinkProps : {};

  return (
    <p className={className}>
      <Link
        href="/terms"
        {...tabProps}
        className={linkClass(termsActive, linkClassName, activeLinkClassName)}
        onClick={() => onLinkClick?.()}
      >
        Terms of Use
      </Link>
      <span className={sepClass} aria-hidden>
        |
      </span>
      <Link
        href="/privacy"
        {...tabProps}
        className={linkClass(privacyActive, linkClassName, activeLinkClassName)}
        onClick={() => onLinkClick?.()}
      >
        Privacy Policy
      </Link>
      <span className={sepClass} aria-hidden>
        |
      </span>
      <Link
        href="/sitemap"
        {...tabProps}
        className={linkClass(sitemapActive, linkClassName, activeLinkClassName)}
        onClick={() => onLinkClick?.()}
      >
        Sitemap
      </Link>
    </p>
  );
}
