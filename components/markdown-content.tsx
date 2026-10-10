"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownContent({
  content,
  components,
}: {
  content: string;
  /** Remplace le rendu de certains éléments (les liens du chat…). */
  components?: Components;
}) {
  return (
    <div className="prose prose-sm max-w-none prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
