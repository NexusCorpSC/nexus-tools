import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  filterItems,
  getItemComparison,
  getItemDetails,
  getItemFacets,
} from "@/lib/items";
import { ITEM_KINDS, MAX_COMPARE_ITEMS } from "@/types/items";
import {
  jsonBlock,
  mdLink,
  PAGE_SIZE,
  READ_ONLY,
  siteUrl,
  toolError,
  toolResult,
  withoutInternals,
} from "../format";

export const itemPath = (slug: string) => `/items/${slug}`;

const itemSummary = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  manufacturer: z.string().optional(),
  variantName: z.string().optional(),
  url: z.string(),
});

export function registerItemTools(server: McpServer) {
  server.registerTool(
    "search_items",
    {
      title: "Search the item catalog",
      description:
        "Search the Nexus item catalog (ship components, weapons, armor, vehicles, resources...) with optional filters, sorted by name. Call list_item_facets to know the exact category and manufacturer values.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Words in the name, description or manufacturer"),
        kind: z.enum(ITEM_KINDS).optional(),
        category: z
          .string()
          .optional()
          .describe("Exact category, see list_item_facets"),
        subcategory: z.string().optional(),
        manufacturer: z.string().optional().describe("Exact manufacturer name"),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(PAGE_SIZE.max).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        page: z.number(),
        items: z.array(itemSummary),
      }),
      annotations: READ_ONLY,
    },
    async ({ page = 1, limit = PAGE_SIZE.default, ...filters }) => {
      const { items, total } = await filterItems({ ...filters, page, limit });
      const summaries = items.map((item) => ({
        slug: item.slug,
        name: item.name,
        kind: item.kind,
        category: item.category || undefined,
        subcategory: item.subcategory || undefined,
        manufacturer: item.manufacturer || undefined,
        variantName: item.variantName || undefined,
        url: siteUrl(itemPath(item.slug)),
      }));
      return toolResult(
        { total, page, items: summaries },
        `${total} items match (page ${page}):\n` +
          summaries
            .map(
              (item) =>
                `- ${mdLink(item.name, itemPath(item.slug))} (slug: ${item.slug}) — ${[item.category, item.manufacturer].filter(Boolean).join(", ")}`,
            )
            .join("\n"),
      );
    },
  );

  server.registerTool(
    "list_item_facets",
    {
      title: "List item categories and manufacturers",
      description:
        "List the categories, subcategories and manufacturers present in the item catalog, to build exact filters for search_items.",
      inputSchema: z.object({}),
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async () => {
      const facets = await getItemFacets();
      const data = {
        categories: facets.categories,
        manufacturers: facets.manufacturers,
      };
      return toolResult(data, jsonBlock(data));
    },
  );

  server.registerTool(
    "get_item",
    {
      title: "Get an item",
      description:
        "Full sheet of a catalog item by slug: description, statistics, where to get it, blueprints that craft it or consume it, variants, set, and vehicle/weapon/resource specifics (resource market prices included).",
      inputSchema: z.object({
        slug: z
          .string()
          .min(1)
          .describe("Item slug, from search or search_items"),
      }),
      outputSchema: z.looseObject({
        slug: z.string(),
        name: z.string(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const item = await getItemDetails(slug);
      if (!item) return toolError(`No item found with slug: ${slug}`);
      const data = {
        ...withoutInternals(item, ["id", "createdAt"]),
        slug: item.slug,
        name: item.name,
        url: siteUrl(itemPath(item.slug)),
      };
      return toolResult(
        data,
        `${mdLink(item.name, itemPath(item.slug))}\n\n${jsonBlock(data)}`,
      );
    },
  );

  server.registerTool(
    "compare_items",
    {
      title: "Compare items",
      description: `Compare up to ${MAX_COMPARE_ITEMS} items of the same kind side by side, statistic by statistic. Items of another kind than the first are rejected.`,
      inputSchema: z.object({
        slugs: z.array(z.string()).min(2).max(MAX_COMPARE_ITEMS),
      }),
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async ({ slugs }) => {
      const comparison = await getItemComparison(slugs);
      if (!comparison) return toolError("None of these items exist.");
      const data = {
        ...comparison,
        url: siteUrl(
          `/items/compare?ids=${comparison.items.map((i) => i.slug).join(",")}`,
        ),
      };
      return toolResult(data, jsonBlock(data));
    },
  );
}
