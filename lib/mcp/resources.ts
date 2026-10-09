import "server-only";
import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/server";
import { getBlueprintBySlug } from "@/lib/crafting";
import { getItemDetails } from "@/lib/items";
import { getPlaceDetails } from "@/lib/places";
import { getShop } from "@/lib/shop-items";
import {
  completeBlueprintSlug,
  completeItemSlug,
  completePlaceSlug,
  completeShopId,
} from "./completions";
import { siteUrl, withoutInternals } from "./format";
import { itemPath } from "./tools/items";
import { placePath, planDigest } from "./tools/places";
import { shopPath } from "./tools/marketplace";

/**
 * Les fiches du catalogue en ressources `nexus://…`, que l'utilisateur peut
 * joindre à la conversation. Chaque variable s'autocomplète
 * (`completion/complete`) : c'est là, et dans les prompts, que la spec prévoit
 * l'autocomplétion — pas dans les arguments d'outils.
 */
type Loader = (key: string) => Promise<Record<string, unknown> | null>;

const ONE_HOUR = { ttlMs: 60 * 60 * 1000, cacheScope: "public" as const };

function register(
  server: McpServer,
  name: string,
  template: string,
  variable: string,
  title: string,
  description: string,
  complete: (value: string) => Promise<string[]>,
  load: Loader,
) {
  server.registerResource(
    name,
    new ResourceTemplate(template, {
      list: undefined,
      complete: { [variable]: complete },
    }),
    { title, description, mimeType: "application/json", cacheHint: ONE_HOUR },
    async (uri, variables) => {
      const key = String(variables[variable]);
      const data = await load(key);
      if (!data) throw new Error(`Not found: ${uri.href}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 1),
          },
        ],
      };
    },
  );
}

export function registerNexusResources(server: McpServer) {
  register(
    server,
    "item",
    "nexus://items/{slug}",
    "slug",
    "Item sheet",
    "A catalog item of Nexus Tools (same content as get_item).",
    completeItemSlug,
    async (slug) => {
      const item = await getItemDetails(slug);
      return item
        ? {
            ...withoutInternals(item, ["id"]),
            url: siteUrl(itemPath(item.slug)),
          }
        : null;
    },
  );
  register(
    server,
    "place",
    "nexus://places/{slug}",
    "slug",
    "Place sheet",
    "A place of the Star Citizen universe on Nexus Tools (same content as get_place).",
    completePlaceSlug,
    async (slug) => {
      const place = await getPlaceDetails(slug);
      return place
        ? {
            ...withoutInternals(place, [
              "id",
              "plans",
              "planTargets",
              "path",
              "celestial",
            ]),
            plans: (place.plans ?? []).map(planDigest),
            url: siteUrl(placePath(place.slug)),
          }
        : null;
    },
  );
  register(
    server,
    "blueprint",
    "nexus://blueprints/{slug}",
    "slug",
    "Crafting blueprint",
    "A crafting blueprint: recipe, statistics, where to get it.",
    completeBlueprintSlug,
    async (slug) => {
      const blueprint = await getBlueprintBySlug(slug);
      return blueprint
        ? {
            ...withoutInternals(
              blueprint as unknown as Record<string, unknown>,
              ["id"],
            ),
            url: siteUrl(`/crafting/blueprints/${blueprint.slug}`),
          }
        : null;
    },
  );
  register(
    server,
    "shop",
    "nexus://shops/{shopId}",
    "shopId",
    "Player shop",
    "A player shop of the Nexus marketplace (use get_shop for its listings).",
    completeShopId,
    async (shopId) => {
      const shop = await getShop(shopId);
      return shop && !shop.reportHidden
        ? {
            id: shop.id,
            name: shop.name,
            description: shop.description,
            owner: shop.owner?.name,
            url: siteUrl(shopPath(shop.id)),
          }
        : null;
    },
  );
}
