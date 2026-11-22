/**
 * Les échanges de Wikelo depuis l'API du Star Citizen Wiki.
 *
 * En jeu, chaque échange de l'Emporium est un contrat donné par Wikelo : ce
 * qu'il faut apporter est dans ses `hauling_orders`, ce qu'il donne dans ses
 * `reward_groups` (un lot, ou plusieurs dont le jeu tire un au hasard) et ses
 * `blueprints`. La liste des missions (`filter[mission_giver]=Wikelo`, une
 * page) ne donne que le résumé : le détail de chaque contrat publié est lu,
 * soit environ 70 requêtes.
 *
 * Un échange est suivi par l'uuid de son contrat, jamais par son titre. Ce
 * qui disparaît de la source est marqué `removedAt`, pas supprimé.
 */

import type { ObjectId } from "mongodb";
import {
  wikeloNameKey,
  type WikeloTrade,
  type WikeloTradeBlueprint,
  type WikeloTradeEntry,
} from "@/types/wikelo";
import {
  newReport,
  planKeyedCollection,
  type KeyedChanges,
  type Report,
} from "./plan";
import {
  cleanGameText,
  isNumber,
  isObject,
  isPlaceholderTitle,
  isString,
  isStringOrNull,
  keepValid,
  SourceFormatError,
} from "./source";
import { detail, list, pool, type WikiStats } from "./wiki";

const SOURCE = "l'API du Star Citizen Wiki";

/** Le donneur de mission tel que le wiki l'écrit. */
const MISSION_GIVER = "Wikelo";

// ─── Forme brute des réponses ─────────────────────────────────────────────────

type RawSummary = {
  uuid: string;
  title: string;
  released: boolean;
  not_for_release: boolean | null;
};

type RawItem = {
  name: string | null;
  uuid: string | null;
  amount?: number | null;
};

type RawHaulingOrder = {
  kind: string;
  name: string | null;
  uuid: string | null;
  min_amount: number | null;
  max_amount: number | null;
  min_scu: number | null;
  max_scu: number | null;
};

type RawBlueprintPool = {
  drop_chance?: number | null;
  items?: {
    name: string | null;
    blueprint_link: string | null;
  }[];
};

type RawTrade = {
  uuid: string;
  title: string;
  description: string | null;
  once_only: boolean | null;
  game_version: string | null;
  reputation_amount: number | null;
  hauling_orders: RawHaulingOrder[] | null;
  reward_groups: { items: RawItem[] }[] | null;
  blueprints: RawBlueprintPool[] | null;
};

function summaryProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isString(raw.uuid)) return "uuid";
  if (!isString(raw.title)) return "title";
  if (typeof raw.released !== "boolean") return "released";
  return null;
}

function tradeProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isString(raw.uuid)) return "uuid";
  if (!isString(raw.title)) return "title";
  if (!isStringOrNull(raw.description ?? null)) return "description";
  if (raw.hauling_orders != null) {
    if (!Array.isArray(raw.hauling_orders)) return "hauling_orders";
    for (const order of raw.hauling_orders) {
      if (!isObject(order) || !isString(order.kind))
        return "hauling_orders[].kind";
      if (!isStringOrNull(order.name ?? null)) return "hauling_orders[].name";
    }
  }
  if (raw.reward_groups != null) {
    if (!Array.isArray(raw.reward_groups)) return "reward_groups";
    for (const group of raw.reward_groups) {
      if (!isObject(group) || !Array.isArray(group.items))
        return "reward_groups[].items";
    }
  }
  if (raw.blueprints != null && !Array.isArray(raw.blueprints))
    return "blueprints";
  return null;
}

// ─── Conversion ───────────────────────────────────────────────────────────────

const BLUEPRINT_LINK = /\/blueprints\/([0-9a-f-]{36})(?:$|[?#/])/i;

const positive = (value: unknown) => (isNumber(value) && value > 0 ? value : 0);

function toRequirement(order: RawHaulingOrder): WikeloTradeEntry | null {
  const name = order.name?.trim();
  if (!name) return null;
  const entry: WikeloTradeEntry = { name };
  if (order.uuid) entry.wikiId = order.uuid.toLowerCase();
  // Une ressource se livre en SCU ; un objet à l'unité. `min` et `max` ne
  // sont pas toujours remplis tous les deux : le plus grand des deux compte.
  const scu = Math.max(positive(order.min_scu), positive(order.max_scu));
  const quantity = Math.max(
    positive(order.min_amount),
    positive(order.max_amount),
  );
  if (order.kind === "Resource" && scu > 0) entry.scu = scu;
  else entry.quantity = quantity || 1;
  return entry;
}

function toReward(item: RawItem): WikeloTradeEntry | null {
  const name = item.name?.trim();
  if (!name) return null;
  const entry: WikeloTradeEntry = {
    name,
    quantity: positive(item.amount) || 1,
  };
  if (item.uuid) entry.wikiId = item.uuid.toLowerCase();
  return entry;
}

function toBlueprints(
  pools: RawBlueprintPool[],
  unreadLinks: Set<string>,
): WikeloTradeBlueprint[] {
  const byId = new Map<string, WikeloTradeBlueprint>();
  for (const drop of pools) {
    const chance = isNumber(drop.drop_chance) ? drop.drop_chance : 1;
    for (const item of drop.items ?? []) {
      const gameId = item.blueprint_link
        ?.match(BLUEPRINT_LINK)?.[1]
        ?.toLowerCase();
      if (!gameId) {
        if (item.blueprint_link) unreadLinks.add(item.blueprint_link);
        continue;
      }
      if (byId.has(gameId)) continue;
      byId.set(gameId, {
        gameId,
        name: item.name?.trim() || gameId,
        ...(chance > 0 && chance < 1 ? { chance } : {}),
      });
    }
  }
  return [...byId.values()];
}

export type WikeloRecord = Omit<WikeloTrade, "importedAt" | "removedAt">;

const unique = (values: string[]) => [...new Set(values)];

function toTrade(
  raw: RawTrade,
  version: string,
  unreadLinks: Set<string>,
): WikeloRecord {
  const requirements = (raw.hauling_orders ?? [])
    .map(toRequirement)
    .filter((entry): entry is WikeloTradeEntry => entry !== null);
  const rewardChoices = (raw.reward_groups ?? [])
    .map((group) =>
      group.items
        .map(toReward)
        .filter((entry): entry is WikeloTradeEntry => entry !== null),
    )
    .filter((group) => group.length > 0);
  const blueprints = toBlueprints(raw.blueprints ?? [], unreadLinks);
  const rewards = rewardChoices.flat();
  const reputation = positive(raw.reputation_amount);

  return {
    wikiId: raw.uuid.toLowerCase(),
    title: cleanGameText(raw.title),
    description: cleanGameText(raw.description ?? ""),
    requirements,
    rewardChoices,
    blueprints,
    ...(reputation > 0 ? { reputation } : {}),
    onceOnly: raw.once_only === true,
    version: raw.game_version || version,
    rewardIds: unique(rewards.flatMap((entry) => entry.wikiId ?? [])),
    rewardNames: unique(rewards.map((entry) => wikeloNameKey(entry.name))),
    requirementIds: unique(requirements.flatMap((entry) => entry.wikiId ?? [])),
    requirementNames: unique(
      requirements.map((entry) => wikeloNameKey(entry.name)),
    ),
    blueprintGameIds: blueprints.map((blueprint) => blueprint.gameId),
  };
}

// ─── Chargement ───────────────────────────────────────────────────────────────

export type WikiWikelo = {
  version: string;
  trades: WikeloRecord[];
  warnings: string[];
  /** Les contrats dont le détail n'a pas pu être lu, par uuid. */
  failed: string[];
};

export async function loadWikiWikelo(
  version: string,
  stats: WikiStats,
): Promise<WikiWikelo> {
  const warnings: string[] = [];
  const summaries = keepValid<RawSummary>(
    SOURCE,
    "Échanges de Wikelo",
    await list(
      "missions",
      { version, "filter[mission_giver]": MISSION_GIVER },
      stats,
    ),
    summaryProblem,
    warnings,
  ).filter(
    (raw) =>
      raw.released && !raw.not_for_release && !isPlaceholderTitle(raw.title),
  );

  const failed: string[] = [];
  const details = await pool(
    summaries.map((summary) => async () => {
      try {
        const body = await detail(
          `missions/${summary.uuid}`,
          { version },
          stats,
        );
        return isObject(body) ? body.data : undefined;
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        failed.push(summary.uuid);
        return undefined;
      }
    }),
  );
  if (failed.length > Math.max(3, summaries.length * 0.05)) {
    throw new SourceFormatError(
      `Échanges de Wikelo : ${failed.length} détail(s) sur ${summaries.length} illisible(s) (par ex. ${failed[0]}). Le format de ${SOURCE} a probablement changé ; rien n'a été écrit.`,
    );
  }
  if (failed.length > 0)
    warnings.push(
      `Échanges de Wikelo : ${failed.length} détail(s) illisible(s), ces échanges gardent leur fiche : ${failed.join(", ")}`,
    );

  const unreadLinks = new Set<string>();
  const trades = keepValid<RawTrade>(
    SOURCE,
    "Détails des échanges de Wikelo",
    details.filter((raw) => raw !== undefined),
    tradeProblem,
    warnings,
  ).map((raw) => toTrade(raw, version, unreadLinks));
  if (unreadLinks.size > 0)
    warnings.push(
      `${unreadLinks.size} lien(s) de blueprint illisible(s), par ex. ${[...unreadLinks][0]}`,
    );
  const empty = trades.filter(
    (trade) =>
      trade.requirements.length === 0 || trade.rewardChoices.length === 0,
  );
  if (empty.length > 0)
    warnings.push(
      `${empty.length} échange(s) sans objet demandé ou sans récompense : ${empty.map((trade) => trade.title).join(", ")}`,
    );

  return {
    version,
    trades,
    warnings,
    failed: failed.map((uuid) => uuid.toLowerCase()),
  };
}

// ─── Plan d'écriture ──────────────────────────────────────────────────────────

const TRADE_FIELDS: (keyof WikeloRecord)[] = [
  "title",
  "description",
  "requirements",
  "rewardChoices",
  "blueprints",
  "reputation",
  "onceOnly",
  "version",
  "rewardIds",
  "rewardNames",
  "requirementIds",
  "requirementNames",
  "blueprintGameIds",
];

export type WikeloPlan = KeyedChanges<WikeloTrade> & { report: Report };

export function planWikelo(
  wikelo: WikiWikelo,
  stored: (WikeloTrade & { _id: ObjectId })[],
  options: { allowMassRemoval: boolean; now?: string },
): WikeloPlan {
  const now = options.now ?? new Date().toISOString();
  const report = newReport();
  // Un détail illisible n'est pas un échange disparu : sa fiche reste.
  const unread = new Set(wikelo.failed);
  const kept = stored.filter((doc) => !unread.has(doc.wikiId));
  const changes = planKeyedCollection<WikeloTrade>(
    "Échanges de Wikelo",
    kept,
    wikelo.trades,
    (doc) => doc.wikiId as string,
    TRADE_FIELDS,
    { now, allowMassRemoval: options.allowMassRemoval },
    report,
  );
  report.counts["dans la source"] = wikelo.trades.length;
  report.counts["avec un blueprint"] = wikelo.trades.filter(
    (trade) => trade.blueprints.length > 0,
  ).length;
  return { ...changes, report };
}
