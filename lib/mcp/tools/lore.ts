import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  getLoreArticle,
  getStarSystem,
  listLoreCategories,
  listStarSystems,
  searchLore,
} from "@/lib/lore";
import { LORE_SEARCH_LIMIT } from "@/types/lore";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";
import { placePath } from "./places";

/**
 * Le lore du 'Verse : les articles de la Galactapedia et la starmap de RSI,
 * importés de l'API du Star Citizen Wiki. Le texte est en anglais, comme la
 * source ; le modèle le traduit pour le joueur.
 */

const articleSummary = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string().optional(),
  categories: z.array(z.string()),
  excerpt: z.string(),
  rsiUrl: z.string(),
  thumbnailUrl: z.string().optional(),
});

const SOURCE_NOTE =
  "Source: RSI Galactapedia and starmap, via the Star Citizen Wiki API. Text is in English: translate it for the player and cite the article.";

export function registerLoreTools(server: McpServer) {
  server.registerTool(
    "search_lore",
    {
      title: "Search the Star Citizen lore",
      description:
        "Search the Galactapedia, RSI's official encyclopedia of the Star Citizen universe (history, people, companies, species, systems, planets, ships, events, culture), and return the most relevant articles with an excerpt. Words are matched in English: translate the player's question first (e.g. « guerre contre les Vanduul » → \"Vanduul war\"). Then call get_lore_article for the full text. Call it without query to list the categories.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            "English words to look for: a name, a topic. Omit to list categories",
          ),
        category: z
          .string()
          .optional()
          .describe(
            "Restrict to a Galactapedia category, e.g. Banu, Government, Commerce",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(LORE_SEARCH_LIMIT.max)
          .optional()
          .describe(`Maximum results (default ${LORE_SEARCH_LIMIT.default})`),
      }),
      outputSchema: z.object({
        query: z.string().optional(),
        results: z.array(articleSummary),
        categories: z
          .array(z.object({ name: z.string(), count: z.number() }))
          .optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, category, limit }) => {
      if (!query?.trim()) {
        const categories = await listLoreCategories();
        return toolResult(
          { results: [], categories },
          `Galactapedia categories (articles):\n` +
            categories.map((c) => `- ${c.name} (${c.count})`).join("\n"),
        );
      }
      const results = await searchLore({ query, category, limit });
      return toolResult(
        { query, results },
        results.length === 0
          ? `No Galactapedia article matches "${query}". Try other English words or a broader name.`
          : `Galactapedia articles for "${query}":\n` +
              results
                .map(
                  (r) =>
                    `- ${r.title} (id: ${r.id}${r.type ? `, ${r.type}` : ""}): ${r.excerpt}`,
                )
                .join("\n") +
              `\n\n${SOURCE_NOTE}`,
      );
    },
  );

  server.registerTool(
    "get_lore_article",
    {
      title: "Read a Galactapedia article",
      description:
        "Full text of a Galactapedia article (Markdown, English) by id or slug, with its categories, tags, the articles it links to, and the starmap systems or bodies it describes. Use it to answer lore questions accurately instead of relying on memory.",
      inputSchema: z.object({
        id: z
          .string()
          .min(1)
          .describe(
            "Article id from search_lore (e.g. RL64awp5oL) or its slug",
          ),
      }),
      outputSchema: z.looseObject({
        id: z.string(),
        title: z.string(),
        body: z.string(),
        rsiUrl: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const article = await getLoreArticle(id);
      if (!article) {
        return toolError(
          `No Galactapedia article with id or slug: ${id}. Use search_lore first.`,
        );
      }
      const places = article.starmap
        .filter((entry) => entry.placeSlug)
        .map((entry) => ({
          name: entry.name,
          url: siteUrl(placePath(entry.placeSlug!)),
        }));
      const data = {
        id: article.wikiId,
        title: article.title,
        type: article.type,
        template: article.template,
        categories: article.categories,
        tags: article.tags,
        body: article.body,
        rsiUrl: article.rsiUrl,
        thumbnailUrl: article.thumbnailUrl,
        linkedArticles: article.linked,
        starmap: article.starmap.map((entry) => ({
          code: entry.code,
          kind: entry.kind,
          name: entry.name,
          system: entry.systemCode,
        })),
        places,
        removed: article.removedAt ? true : undefined,
      };
      return toolResult(
        data,
        [
          `# ${article.title}`,
          [article.type, article.categories.join(", ")]
            .filter(Boolean)
            .join(" · "),
          article.body,
          article.linked.length
            ? `Linked articles: ${article.linked.map((l) => `${l.title} (id: ${l.id})`).join(", ")}`
            : "",
          places.length
            ? `On Nexus Tools: ${article.starmap
                .filter((entry) => entry.placeSlug)
                .map((entry) => mdLink(entry.name, placePath(entry.placeSlug!)))
                .join(", ")}`
            : "",
          `Official page: ${article.rsiUrl}`,
          article.removedAt
            ? "This article is no longer in the Galactapedia."
            : "",
          SOURCE_NOTE,
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    },
  );

  server.registerTool(
    "get_star_system",
    {
      title: "Get a star system from the starmap",
      description:
        "Lore sheet of a star system from RSI's starmap: description, affiliation (UEE, Banu, Xi'an, Unclaimed…), population, economy and danger ratings (0-10), jump points to other systems, and its stars, planets, moons, stations and belts with their own descriptions. Call it without system to list every system. For in-game coordinates and services, use get_place instead.",
      inputSchema: z.object({
        system: z
          .string()
          .optional()
          .describe(
            "System code or name, e.g. STANTON, Pyro, Nyx. Omit to list systems",
          ),
      }),
      outputSchema: z.looseObject({
        systems: z
          .array(z.looseObject({ code: z.string(), name: z.string() }))
          .optional(),
        code: z.string().optional(),
        name: z.string().optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ system }) => {
      if (!system?.trim()) {
        const systems = await listStarSystems();
        return toolResult(
          { systems },
          `Star systems (${systems.length}). Status P = known, M = mentioned only, N = unexplored:\n` +
            systems
              .map(
                (s) =>
                  `- ${s.name} (${s.code}, ${s.status ?? "?"}${s.affiliations.length ? `, ${s.affiliations.join("/")}` : ""})`,
              )
              .join("\n"),
        );
      }
      const found = await getStarSystem(system);
      if (!found) {
        return toolError(
          `No star system "${system}". Call get_star_system without system to list them.`,
        );
      }
      const data = {
        code: found.code,
        name: found.name,
        type: found.type,
        status: found.status,
        affiliations: found.affiliations,
        ratings: found.sensor,
        description: found.description,
        jumpPoints: found.jumpPoints,
        article: found.article,
        url: found.placeSlug ? siteUrl(placePath(found.placeSlug)) : undefined,
        bodies: found.bodies.map((body) => ({
          code: body.code,
          name: body.name,
          designation: body.designation,
          type: body.type,
          subType: body.subType,
          habitable: body.habitable,
          affiliations: body.affiliations.length
            ? body.affiliations
            : undefined,
          ratings: body.sensor,
          description: body.description,
          articleId: body.articleId,
          url: body.placeSlug ? siteUrl(placePath(body.placeSlug)) : undefined,
        })),
      };
      const line = (body: (typeof data.bodies)[number]) =>
        `- ${body.name}${body.designation ? ` (${body.designation})` : ""}, ${body.subType ?? body.type}` +
        (body.articleId ? ` [article id: ${body.articleId}]` : "") +
        (body.description ? `: ${body.description}` : "");
      return toolResult(
        data,
        [
          `# ${found.name} system (${found.code})`,
          [
            found.affiliations.join("/"),
            found.sensor
              ? `population ${found.sensor.population}/10, economy ${found.sensor.economy}/10, danger ${found.sensor.danger}/10`
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          found.description ?? "",
          found.jumpPoints?.length
            ? `Jump points to: ${found.jumpPoints.map((j) => `${j.toName ?? j.to}${j.size ? ` (${j.size})` : ""}`).join(", ")}`
            : "",
          found.article
            ? `Galactapedia: ${found.article.title} (id: ${found.article.id})`
            : "",
          data.url
            ? `On Nexus Tools: ${mdLink(found.name, placePath(found.placeSlug!))}`
            : "",
          data.bodies.length
            ? `Bodies:\n${data.bodies.map(line).join("\n")}`
            : "",
          SOURCE_NOTE,
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    },
  );
}
