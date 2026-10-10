import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerAppViews, withAppViews } from "./apps";
import { registerNexusPrompts } from "./prompts";
import { registerNexusResources } from "./resources";
import { registerAccountTools } from "./tools/account";
import { registerBlueprintTools } from "./tools/blueprints";
import { registerContributionTools } from "./tools/contributions";
import { registerInventoryTools } from "./tools/inventory";
import { registerPlanDraftTools } from "./tools/plan-drafts";
import { registerPlanFormatResource } from "./plan-format";
import { registerItemTools } from "./tools/items";
import { registerMarketplaceReadTools } from "./tools/marketplace";
import { registerMarketplacePersonalTools } from "./tools/marketplace-personal";
import { registerPlaceTools } from "./tools/places";
import { registerSearchTools } from "./tools/search";

/**
 * Le serveur MCP de Nexus Tools, servi par `app/mcp/route.ts`.
 *
 * Chaque domaine enregistre ses outils dans `lib/mcp/tools/`, en appelant les
 * mêmes fonctions de `lib/` que le site : ce que l'assistant voit est ce que le
 * joueur voit. L'ordre d'enregistrement est l'ordre de `tools/list`, que la
 * spec veut déterministe.
 */
export const MCP_SERVER_INFO = { name: "Nexus Tools", version: "2.0.0" };

export function registerNexusServer(mcp: McpServer) {
  const server = withAppViews(mcp);
  registerSearchTools(server);
  registerAccountTools(server);
  registerBlueprintTools(server);
  registerItemTools(server);
  registerPlaceTools(server);
  registerMarketplaceReadTools(server);
  registerMarketplacePersonalTools(server);
  registerInventoryTools(server);
  registerContributionTools(server);
  registerPlanDraftTools(server);
  registerNexusResources(server);
  registerPlanFormatResource(server);
  registerNexusPrompts(server);
  registerAppViews(server);
}

/**
 * Les listes ne changent qu'avec un déploiement : les clients peuvent les
 * garder une heure (champs `ttlMs` / `cacheScope` de la spec 2026-07-28).
 */
export const MCP_CACHE_HINTS = {
  "tools/list": { ttlMs: 60 * 60 * 1000, cacheScope: "public" },
  "prompts/list": { ttlMs: 60 * 60 * 1000, cacheScope: "public" },
  "resources/templates/list": { ttlMs: 60 * 60 * 1000, cacheScope: "public" },
  "server/discover": { ttlMs: 60 * 60 * 1000, cacheScope: "public" },
} as const;

export const MCP_INSTRUCTIONS =
  "Nexus Tools is a community toolbox for Star Citizen. Use search first when the kind of thing is unclear, " +
  "then the dedicated get_* tools. Links point to tools.services.nexus pages: give them to the user. " +
  "Prices are in aUEC. NPS coordinates come from the in-game /showlocation command. " +
  "Personal tools (inventory, contributions, orders…) need the user to sign in to their Nexus account; " +
  "every change they make is shown to the user for confirmation first, and contributions go to community review unless the user is a trusted contributor.";
