import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerAppViews, withAppViews } from "./apps";
import { registerNexusPrompts } from "./prompts";
import { registerNexusResources } from "./resources";
import { registerAccountTools } from "./tools/account";
import { registerBlueprintTools } from "./tools/blueprints";
import { registerCommunityTools } from "./tools/community";
import { registerContributionTools } from "./tools/contributions";
import { registerCraftingTools } from "./tools/crafting";
import { registerEventTools } from "./tools/events";
import { registerInventoryTools } from "./tools/inventory";
import { registerPlanDraftTools } from "./tools/plan-drafts";
import { registerPlanFormatResource } from "./plan-format";
import { registerItemTools } from "./tools/items";
import { registerLoreTools } from "./tools/lore";
import { registerWikeloTools } from "./tools/wikelo";
import { registerRadarTools } from "./tools/radar";
import { registerAaronHaloTools } from "./tools/aaron-halo";
import { registerMarketplaceReadTools } from "./tools/marketplace";
import { registerMarketplacePersonalTools } from "./tools/marketplace-personal";
import { registerPlaceTools } from "./tools/places";
import { registerPrivatePlaceTools } from "./tools/private-places";
import { registerMarkerCollectionTools } from "./tools/marker-collections";
import { registerMarkerTools } from "./tools/markers";
import { registerMissionTools } from "./tools/missions";
import { registerNoteTools } from "./tools/notes";
import { registerParcelTools } from "./tools/parcels";
import { registerPlayerTools } from "./tools/players";
import { registerRefiningTools } from "./tools/refining";
import { registerRequestTools } from "./tools/requests";
import { registerSearchTools } from "./tools/search";
import { registerSharingTools } from "./tools/sharing";
import { registerSocialTools } from "./tools/social";
import { registerTimelineTools } from "./tools/timeline";

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
  registerCraftingTools(server);
  registerItemTools(server);
  registerMissionTools(server);
  registerPlaceTools(server);
  registerPrivatePlaceTools(server);
  registerLoreTools(server);
  registerWikeloTools(server);
  registerRadarTools(server);
  registerAaronHaloTools(server);
  registerTimelineTools(server);
  registerMarketplaceReadTools(server);
  registerMarketplacePersonalTools(server);
  registerRequestTools(server);
  registerInventoryTools(server);
  registerParcelTools(server);
  registerRefiningTools(server);
  registerMarkerTools(server);
  registerMarkerCollectionTools(server);
  registerPlayerTools(server);
  registerSocialTools(server);
  registerEventTools(server);
  registerSharingTools(server);
  registerNoteTools(server);
  registerContributionTools(server);
  registerCommunityTools(server);
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
  "For the lore of the 'Verse (history, people, companies, species, systems), use search_lore, get_lore_article and get_star_system: " +
  "they hold RSI's Galactapedia and starmap, in English. " +
  "For CIG's official in-game events (live, upcoming, past, their rewards, guide and known bugs), use search_official_events and get_official_event. " +
  "For Wikelo's trades (the Banu trader of the Wikelo Emporium: what he asks for, the items, ships and blueprints he gives), use search_wikelo_trades; get_item and get_blueprint_by_slug also list them. " +
  "To tell what a radar signature (RS) read on the in-game scan is (ore, asteroid, wreck, and how many rocks), use identify_radar_signature. " +
  "To get into a band of the Aaron Halo (Stanton's asteroid belt, no quantum beacon), use plan_aaron_halo_route: it gives the remaining distance at which to cut the jump. " +
  "Personal tools (inventory, parcels, refining orders, position markers, private places, friends and organizations, events and planned sessions, owned blueprints, reputations, notepad, sharing, contributions, marketplace orders, the request board…) need the user to sign in to their Nexus account; " +
  "every change they make is shown to the user for confirmation first, and contributions go to community review unless the user is a trusted contributor.";
