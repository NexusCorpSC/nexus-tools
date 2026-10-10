import type { CallToolResult } from "@modelcontextprotocol/server";
import { siteBaseUrl } from "@/lib/site-url";

/**
 * Ce que tous les outils MCP partagent pour répondre.
 *
 * Chaque outil renvoie deux fois la même chose : un `structuredContent` conforme
 * à son `outputSchema`, que les clients récents lisent, et un texte Markdown,
 * que les autres montrent au modèle tel quel. Les liens sont absolus et suivent
 * `NEXT_PUBLIC_BASE_URL`, pour qu'une préproduction ne renvoie pas vers la prod.
 */

export function siteUrl(path: string): string {
  return new URL(path, siteBaseUrl()).href;
}

/** Un lien Markdown vers une page du site. */
export function mdLink(label: string, path: string): string {
  return `[${label.replace(/[[\]]/g, "")}](${siteUrl(path)})`;
}

export function toolResult<T extends Record<string, unknown>>(
  structured: T,
  text: string,
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: structured,
  };
}

export function toolError(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** Les annotations d'un outil qui ne fait que lire le catalogue de Nexus. */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Un objet en JSON, pour le texte de repli : les clients qui ne lisent pas
 * `structuredContent` donnent au modèle ce texte-là, il doit donc tout porter.
 */
export function jsonBlock(data: unknown): string {
  return "```json\n" + JSON.stringify(data, null, 1) + "\n```";
}

/** Retire les champs internes avant de rendre un document de la base. */
export function withoutInternals<T extends Record<string, unknown>>(
  doc: T,
  extra: string[] = [],
): Record<string, unknown> {
  const drop = new Set(["_id", "source", ...extra]);
  return Object.fromEntries(
    Object.entries(doc).filter(
      ([key, value]) => !drop.has(key) && value !== undefined,
    ),
  );
}

/** La taille de page des outils de recherche. */
export const PAGE_SIZE = { default: 10, max: 50 } as const;
