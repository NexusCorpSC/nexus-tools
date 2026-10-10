"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Le site lui-même, quelle que soit l'adresse d'où on le sert. */
const SITE_HOST = "tools.services.nexus";

/**
 * Un lien vers une page du site, en chemin relatif (`/items/…`), ou `null`
 * s'il mène ailleurs. Les réponses donnent des adresses complètes du site.
 */
function sitePath(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    const here = typeof window === "undefined" ? null : window.location.host;
    if (url.host !== SITE_HOST && url.host !== here) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

const components: Components = {
  // Une page du site s'ouvre sans recharger : le panneau du chat reste
  // ouvert, et la réponse en cours aussi. Le reste s'ouvre à côté.
  a: ({ href, children }) => {
    const path = href ? sitePath(href) : null;
    if (path) return <Link href={path}>{children}</Link>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

/** Le texte d'une réponse de Nexus Chat. */
export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
