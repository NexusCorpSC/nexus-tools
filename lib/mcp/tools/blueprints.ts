import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getBlueprintBySlug, searchBlueprints } from "@/lib/crafting";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";

const blueprintPath = (slug: string) => `/crafting/blueprints/${slug}`;

const blueprintSummary = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string().optional(),
  url: z.string(),
});

const blueprintDetails = blueprintSummary.extend({
  subcategory: z.string().optional(),
  description: z.string().optional(),
  obtention: z.string().optional(),
  tier: z.number().optional(),
  craftingTimeSeconds: z.number().optional(),
  imageUrl: z.string().optional(),
  recipe: z
    .array(
      z.object({
        component: z.string(),
        options: z.array(
          z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string().optional(),
            minQuality: z.number().optional(),
          }),
        ),
      }),
    )
    .optional(),
  statistics: z
    .record(
      z.string(),
      z.object({
        value: z.union([z.string(), z.number()]),
        unit: z.string().optional(),
      }),
    )
    .optional(),
});

export function registerBlueprintTools(server: McpServer) {
  server.registerTool(
    "search_blueprints",
    {
      title: "Search for a blueprint",
      description:
        "Search for up to 3 crafting blueprints with a generic query (fuzzy on the name) and return their slugs and full names to use with other tools.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Part of the blueprint name"),
      }),
      outputSchema: z.object({
        query: z.string(),
        results: z.array(blueprintSummary),
      }),
      annotations: READ_ONLY,
    },
    async ({ query }) => {
      const blueprints = await searchBlueprints(query, { fuzzy: true });
      const results = blueprints.map((bp) => ({
        slug: bp.slug,
        name: bp.name,
        category: bp.category || undefined,
        url: siteUrl(blueprintPath(bp.slug)),
      }));
      return toolResult(
        { query, results },
        `You searched for: ${query}\n\nFound ${results.length} blueprints:\n` +
          results
            .map(
              (bp) =>
                `- ${bp.name} (slug: ${bp.slug}) (link: ${mdLink(bp.name, blueprintPath(bp.slug))})`,
            )
            .join("\n"),
      );
    },
  );

  server.registerTool(
    "get_blueprint_by_slug",
    {
      title: "Get blueprint details by slug",
      description:
        "Retrieve detailed information about a blueprint, recipe, obtention, statistics, ... using its slug.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Slug returned by search_blueprints"),
      }),
      outputSchema: blueprintDetails,
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const blueprint = await getBlueprintBySlug(slug);
      if (!blueprint) {
        return toolError(`No blueprint found with slug: ${slug}`);
      }
      const details: z.infer<typeof blueprintDetails> = {
        slug: blueprint.slug,
        name: blueprint.name,
        category: blueprint.category || undefined,
        url: siteUrl(blueprintPath(blueprint.slug)),
        subcategory: blueprint.subcategory || undefined,
        description: blueprint.description || undefined,
        obtention: blueprint.obtention || undefined,
        tier: blueprint.tier,
        craftingTimeSeconds:
          blueprint.recipe?.craftingTime ?? blueprint.craftingTime,
        imageUrl: blueprint.imageUrl || undefined,
        recipe: blueprint.recipe?.components.map((component) => ({
          component: component.name,
          options: component.options.map((option) => ({
            name: option.name,
            quantity: option.quantity,
            unit: option.unit,
            minQuality: option.minQuality,
          })),
        })),
        statistics: blueprint.statistics,
      };
      const recipe = details.recipe?.length
        ? "\nRecipe:\n" +
          details.recipe
            .map(
              (component) =>
                `- ${component.component}: ` +
                component.options
                  .map(
                    (option) =>
                      `${option.quantity}${option.unit ? ` ${option.unit}` : ""} ${option.name}` +
                      (option.minQuality ? ` (quality ≥ ${option.minQuality})` : ""),
                  )
                  .join(" or "),
            )
            .join("\n")
        : "";
      return toolResult(
        details,
        `Blueprint Details:\nName: ${blueprint.name}\nCategory: ${blueprint.category}\nSubcategory: ${blueprint.subcategory}\nObtained from: ${blueprint.obtention || "No information about how to get this blueprint."}\nDescription: ${blueprint.description}${recipe}\nLink with details: ${mdLink(blueprint.name, blueprintPath(blueprint.slug))}\n${blueprint.imageUrl ? `Image: ![${blueprint.name}](${blueprint.imageUrl})` : ""}`,
      );
    },
  );
}
