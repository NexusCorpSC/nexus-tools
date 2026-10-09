import "server-only";
import { completable, type McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  completeBlueprintSlug,
  completeItemSlug,
  completePlaceSlug,
} from "./completions";

/**
 * Des prompts prêts à l'emploi, dont les arguments s'autocomplètent : le
 * joueur choisit l'objet ou le lieu dans une liste au lieu de taper un slug.
 */
function userPrompt(text: string) {
  return {
    messages: [
      { role: "user" as const, content: { type: "text" as const, text } },
    ],
  };
}

export function registerNexusPrompts(server: McpServer) {
  server.registerPrompt(
    "where_to_get_item",
    {
      title: "Where to get or buy an item",
      description:
        "Find every way to obtain an item: where it drops or is sold in game, blueprints that craft it, and player listings on the Nexus marketplace.",
      argsSchema: z.object({
        item: completable(z.string().describe("Item slug"), completeItemSlug),
      }),
    },
    ({ item }) =>
      userPrompt(
        `I want to get the item "${item}" in Star Citizen. Using the Nexus Tools server: read it with get_item, ` +
          `then list where to obtain it (obtention), the blueprints that craft it and their recipe (get_blueprint_by_slug), ` +
          `and the marketplace listings selling it (search_listings with its name), cheapest first. ` +
          `Finish with the option you recommend.`,
      ),
  );

  server.registerPrompt(
    "go_to_place",
    {
      title: "Go to a place",
      description:
        "Plan a trip to a place: where it is, how to get there, its services, and the NPS heading from a /showlocation reading.",
      argsSchema: z.object({
        place: completable(
          z.string().describe("Destination place slug"),
          completePlaceSlug,
        ),
        location: z
          .string()
          .optional()
          .describe("Optional /showlocation line of where you are now"),
      }),
    },
    ({ place, location }) =>
      userPrompt(
        `I want to go to "${place}" in Star Citizen. Read it with get_place (parent chain, services, tip, maps). ` +
          (location
            ? `I am here: ${location}. Call nps_locate with this location and destination "${place}" and tell me the distance and heading. `
            : "") +
          `Explain how to get there step by step and what I can do on site.`,
      ),
  );

  server.registerPrompt(
    "craft_blueprint",
    {
      title: "Craft a blueprint",
      description:
        "Prepare a craft: recipe, where to get the blueprint and every material, and marketplace listings for the materials.",
      argsSchema: z.object({
        blueprint: completable(
          z.string().describe("Blueprint slug"),
          completeBlueprintSlug,
        ),
      }),
    },
    ({ blueprint }) =>
      userPrompt(
        `I want to craft the blueprint "${blueprint}". Read it with get_blueprint_by_slug, then for each material ` +
          `of the recipe find where to get it (search_items, get_item) and the marketplace listings selling it (search_listings). ` +
          `Give me a shopping list with quantities.`,
      ),
  );
}
