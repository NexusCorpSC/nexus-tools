import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { searchEverything } from "@/lib/search";
import {
  MAX_SEARCH_LIMIT,
  MIN_SEARCH_QUERY_LENGTH,
  PRIVATE_SEARCH_TYPES,
  SEARCH_TYPES,
} from "@/types/search";
import { mdLink, READ_ONLY, siteUrl, toolResult } from "../format";

const PUBLIC_TYPES = SEARCH_TYPES.filter(
  (type) => !PRIVATE_SEARCH_TYPES.includes(type),
) as [string, ...string[]];

export function registerSearchTools(server: McpServer) {
  server.registerTool(
    "search",
    {
      title: "Search everything on Nexus Tools",
      description:
        "Search every public collection of Nexus Tools at once (blueprints, items, places, missions, factions, marketplace listings, shops, organizations, cargo ships) and return the best matches with their type, id/slug and link. Use it first when you do not know what kind of thing the user means, then call the dedicated tool (get_item, get_place, get_listing, ...).",
      inputSchema: z.object({
        query: z
          .string()
          .min(MIN_SEARCH_QUERY_LENGTH)
          .describe("Words to look for, at least 2 characters"),
        types: z
          .array(z.enum(PUBLIC_TYPES))
          .optional()
          .describe("Restrict to these types; all of them by default"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .optional()
          .describe("Maximum results per type (default 5)"),
      }),
      outputSchema: z.object({
        query: z.string(),
        results: z.array(
          z.object({
            type: z.string(),
            id: z.string(),
            title: z.string(),
            subtitle: z.string().optional(),
            url: z.string(),
            meta: z
              .record(
                z.string(),
                z.union([z.string(), z.number(), z.boolean()]),
              )
              .optional(),
          }),
        ),
        hasMore: z.array(z.string()),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, types, limit }) => {
      const found = await searchEverything({
        query,
        types: types as (typeof SEARCH_TYPES)[number][] | undefined,
        limit,
      });
      const results = found.results.map((result) => ({
        type: result.type,
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
        url: siteUrl(result.url),
        meta: result.meta,
      }));
      const text = results.length
        ? found.results
            .map(
              (result) =>
                `- [${result.type}] ${mdLink(result.title, result.url)}` +
                ` (id: ${result.id})${result.subtitle ? ` — ${result.subtitle}` : ""}`,
            )
            .join("\n")
        : "No result.";
      return toolResult(
        { query, results, hasMore: found.hasMore },
        `Results for "${query}":\n${text}` +
          (found.hasMore.length
            ? `\n\nMore results exist for: ${found.hasMore.join(", ")} (raise limit or use the dedicated search tool).`
            : ""),
      );
    },
  );
}
