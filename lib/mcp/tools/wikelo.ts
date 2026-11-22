import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { searchWikeloTrades, WIKELO_SEARCH_LIMIT } from "@/lib/wikelo";
import type { WikeloTradeEntryView, WikeloTradeView } from "@/types/wikelo";
import { READ_ONLY, siteUrl, toolResult } from "../format";
import { itemPath } from "./items";

/**
 * Les échanges de Wikelo, le marchand banu de l'Emporium : ce qu'il demande
 * et ce qu'il donne (objets, véhicules, blueprints). Les mêmes échanges sont
 * aussi dans `get_item` (champ `wikelo`) et `get_blueprint_by_slug` (champ
 * `wikeloTrades`).
 */

const SOURCE_NOTE =
  "Source: game data via the Star Citizen Wiki API. Item names and trade titles are the in-game English ones.";

const entry = z.object({
  name: z.string(),
  quantity: z.number().optional(),
  scu: z.number().optional(),
  itemSlug: z.string().optional(),
  url: z.string().optional(),
});

export const wikeloTradeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  requirements: z.array(entry),
  rewardChoices: z
    .array(z.array(entry))
    .describe("One group in general; several means one is drawn at random"),
  blueprints: z.array(
    z.object({
      gameId: z.string(),
      name: z.string(),
      chance: z.number().optional(),
      slug: z.string().optional(),
      url: z.string().optional(),
    }),
  ),
  reputation: z.number().optional(),
  onceOnly: z.boolean(),
  version: z.string(),
  missionUrl: z.string().optional(),
});

const withUrl = (value: WikeloTradeEntryView) => ({
  ...value,
  ...(value.itemSlug ? { url: siteUrl(itemPath(value.itemSlug)) } : {}),
});

/** Un échange avec les adresses de ses fiches, pour le modèle. */
export function wikeloTradeData(
  trade: WikeloTradeView,
): z.infer<typeof wikeloTradeSchema> {
  const { missionId, ...rest } = trade;
  return {
    ...rest,
    requirements: trade.requirements.map(withUrl),
    rewardChoices: trade.rewardChoices.map((group) => group.map(withUrl)),
    blueprints: trade.blueprints.map((blueprint) => ({
      ...blueprint,
      ...(blueprint.slug
        ? { url: siteUrl(`/crafting/blueprints/${blueprint.slug}`) }
        : {}),
    })),
    ...(missionId ? { missionUrl: siteUrl(`/missions/${missionId}`) } : {}),
  };
}

const amount = (value: WikeloTradeEntryView) =>
  value.scu !== undefined ? `${value.scu} SCU` : `${value.quantity ?? 1} ×`;

/** Un échange sur quelques lignes de Markdown. */
export function wikeloTradeText(trade: WikeloTradeView): string {
  const rewards =
    trade.rewardChoices.length === 1
      ? trade.rewardChoices[0]
          .map((value) => `${amount(value)} ${value.name}`)
          .join(", ")
      : `one at random of ${trade.rewardChoices
          .map((group) => group.map((value) => value.name).join(" + "))
          .join(" | ")}`;
  const blueprints = trade.blueprints.length
    ? `\n  Blueprint: ${trade.blueprints
        .map(
          (blueprint) =>
            blueprint.name +
            (blueprint.chance !== undefined
              ? ` (${Math.round(blueprint.chance * 100)}%)`
              : ""),
        )
        .join(", ")}`
    : "";
  return (
    `- **${trade.title}**${trade.onceOnly ? " (once only)" : ""}\n` +
    `  Bring: ${trade.requirements
      .map((value) => `${amount(value)} ${value.name}`)
      .join(", ")}\n` +
    `  Receive: ${rewards}${blueprints}`
  );
}

export function registerWikeloTools(server: McpServer) {
  server.registerTool(
    "search_wikelo_trades",
    {
      title: "Search Wikelo's trades",
      description:
        'Wikelo is the Banu trader of the Wikelo Emporium: players bring him items and resources (Wikelo Favors, creature parts, ores, medals…) and he gives special items, armors, weapons, ships and sometimes their blueprint. Search his trades by what he gives (role: reward), what he asks for (role: requirement), or both. Words are matched in English against in-game names (e.g. « faveur de Wikelo » → "Wikelo Favor"). Call it without query to list every trade. get_item and get_blueprint_by_slug also list the Wikelo trades of one item or blueprint.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            'English words of an item, ship or trade name, e.g. "Polaris", "Carinite"',
          ),
        role: z
          .enum(["reward", "requirement"])
          .optional()
          .describe(
            "reward: what Wikelo gives; requirement: what he asks for. Omit for both, and trade titles",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(WIKELO_SEARCH_LIMIT.max)
          .optional()
          .describe(`Maximum trades (default ${WIKELO_SEARCH_LIMIT.default})`),
      }),
      outputSchema: z.object({
        total: z.number(),
        trades: z.array(wikeloTradeSchema),
        source: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, role, limit }) => {
      const result = await searchWikeloTrades({ query, role, limit });
      const data = {
        total: result.total,
        trades: result.trades.map(wikeloTradeData),
        source: SOURCE_NOTE,
      };
      const text =
        result.trades.length === 0
          ? `No Wikelo trade matches${query ? ` "${query}"` : ""}.`
          : `${result.total} Wikelo trade(s)${result.total > result.trades.length ? `, first ${result.trades.length}` : ""}:\n\n` +
            result.trades.map(wikeloTradeText).join("\n") +
            `\n\n${SOURCE_NOTE}`;
      return toolResult(data, text);
    },
  );
}
