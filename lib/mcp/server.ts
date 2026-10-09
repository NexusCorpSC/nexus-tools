import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerBlueprintTools } from "./tools/blueprints";

/**
 * Le serveur MCP de Nexus Tools, servi par `app/mcp/route.ts`.
 *
 * Chaque domaine enregistre ses outils dans `lib/mcp/tools/`, en appelant les
 * mêmes fonctions de `lib/` que le site : ce que l'assistant voit est ce que le
 * joueur voit. L'ordre d'enregistrement est l'ordre de `tools/list`, que la
 * spec veut déterministe.
 */
export const MCP_SERVER_INFO = { name: "Nexus Tools", version: "2.0.0" };

export function registerNexusServer(server: McpServer) {
  registerBlueprintTools(server);
}
