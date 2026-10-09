import type { CallToolResult } from "@modelcontextprotocol/server";

/**
 * Ce que tous les outils MCP partagent pour répondre.
 *
 * Chaque outil renvoie deux fois la même chose : un `structuredContent` conforme
 * à son `outputSchema`, que les clients récents lisent, et un texte Markdown,
 * que les autres montrent au modèle tel quel. Les liens sont absolus et suivent
 * `NEXT_PUBLIC_BASE_URL`, pour qu'une préproduction ne renvoie pas vers la prod.
 */

const DEFAULT_BASE_URL = "https://tools.services.nexus";

export function siteUrl(path: string): string {
  return new URL(path, process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_BASE_URL)
    .href;
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
