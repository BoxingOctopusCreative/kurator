import ReactMarkdown from "react-markdown";
import { LEGAL_MARKDOWN_PROSE_CLASS, legalMarkdownComponents } from "@/lib/legalMarkdownPage";

type Props = {
  markdown: string;
};

export function LegalMarkdownArticle({ markdown }: Props) {
  return (
    <article className={LEGAL_MARKDOWN_PROSE_CLASS}>
      <ReactMarkdown components={legalMarkdownComponents}>{markdown}</ReactMarkdown>
    </article>
  );
}
