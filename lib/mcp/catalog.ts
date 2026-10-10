import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { PERSONAL_TOOLS } from "./auth";
import type { McpScope, OidcScope } from "./oauth-config";
import { registerNexusServer } from "./server";

export type McpToolEntry = {
  name: string;
  title: string;
  description: string;
  /** La portée OAuth exigée ; absente pour un outil public. */
  scope?: McpScope | OidcScope;
  /** Vrai pour un outil qui écrit (confirmé par le joueur). */
  writes: boolean;
  /** L'outil a une vue MCP Apps. */
  view: boolean;
};

let cache: McpToolEntry[] | null = null;

/**
 * Les outils du serveur MCP, lus en l'enregistrant sur un faux serveur : la
 * page Développeurs suit ainsi le registre sans liste à tenir à côté. Les
 * outils réservés aux vues (visibilité `app`) n'y figurent pas.
 */
export function listMcpTools(): McpToolEntry[] {
  if (cache) return cache;
  const tools: McpToolEntry[] = [];
  const handle = { update() {}, enable() {}, disable() {}, remove() {} };
  const collector = {
    registerTool(
      name: string,
      config: {
        title?: string;
        description?: string;
        annotations?: { readOnlyHint?: boolean };
        _meta?: { ui?: { resourceUri?: string; visibility?: string[] } };
      },
    ) {
      const ui = config._meta?.ui;
      if (ui?.visibility && !ui.visibility.includes("model")) return handle;
      tools.push({
        name,
        title: config.title ?? name,
        description: config.description ?? "",
        scope: PERSONAL_TOOLS[name],
        writes: config.annotations?.readOnlyHint === false,
        view: !!ui?.resourceUri,
      });
      return handle;
    },
    registerResource: () => handle,
    registerPrompt: () => handle,
  };
  registerNexusServer(collector as unknown as McpServer);
  cache = tools;
  return tools;
}
