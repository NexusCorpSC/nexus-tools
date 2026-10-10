"use client";

import Link from "next/link";
import type { Components } from "react-markdown";
import { MarkdownContent } from "@/components/markdown-content";
import { siteBaseUrl } from "@/lib/site-url";

/** L'hôte du site, celui des liens que donnent les réponses (`siteUrl`). */
const SITE_HOST = new URL(siteBaseUrl()).host;

/**
 * Un lien vers une page du site, en chemin relatif (`/items/…`), ou `null`
 * s'il mène ailleurs. Les réponses donnent des adresses complètes du site.
 * Le même résultat sur le serveur et dans le navigateur : `/chat` est rendu
 * côté serveur.
 */
function sitePath(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    if (url.host !== SITE_HOST) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

const components: Components = {
  // Une page du site s'ouvre sans recharger : le panneau du chat reste
  // ouvert, et la réponse en cours aussi. Une ancre (note de bas de page)
  // reste dans la page ; le reste s'ouvre à côté.
  a: ({ href, children }) => {
    if (!href || href.startsWith("#")) return <a href={href}>{children}</a>;
    const path = sitePath(href);
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
  return <MarkdownContent content={content} components={components} />;
}
