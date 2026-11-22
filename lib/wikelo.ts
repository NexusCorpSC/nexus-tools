import "server-only";

import db from "@/lib/db";
import type { Item } from "@/types/items";
import {
  wikeloNameKey,
  type ItemWikeloTrades,
  type WikeloTrade,
  type WikeloTradeEntry,
  type WikeloTradeEntryView,
  type WikeloTradeView,
} from "@/types/wikelo";

/**
 * Les échanges de Wikelo, importés par `npm run import:game-data -- wikelo`.
 * Une fiche objet montre ceux qui donnent l'objet et ceux qui le demandent ;
 * une fiche blueprint ceux qui donnent le blueprint.
 *
 * Un objet est retrouvé par l'uuid du jeu quand il vient du wiki
 * (`source.id`), sinon par son nom : les véhicules et les objets saisis à la
 * main n'ont pas d'uuid.
 */

const COLLECTION = "wikeloTrades";

/** Au plus autant d'échanges par recherche du MCP. */
export const WIKELO_SEARCH_LIMIT = { default: 10, max: 30 } as const;

function trades() {
  return db.db().collection<WikeloTrade>(COLLECTION);
}

const ACTIVE = { removedAt: { $exists: false } } as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Anchored, case-insensitive matcher for a name, tolerant to spacing. */
function nameMatcher(name: string): RegExp {
  const parts = name.trim().split(/\s+/).map(escapeRegex);
  return new RegExp(`^\\s*${parts.join("\\s+")}\\s*$`, "i");
}

type ItemRef = Pick<Item, "slug" | "name" | "variantName" | "source">;

/**
 * La fiche de chaque objet cité par ces échanges : par uuid d'abord, puis par
 * nom. Entre plusieurs fiches du même nom, la plus simple (sans variante, au
 * slug le plus court) gagne, comme pour les emplacements d'un vaisseau.
 */
async function resolveItems(entries: WikeloTradeEntry[]): Promise<{
  byId: Map<string, string>;
  byName: Map<string, string>;
}> {
  const ids = [...new Set(entries.flatMap((entry) => entry.wikiId ?? []))];
  const names = [...new Set(entries.map((entry) => wikeloNameKey(entry.name)))];
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  if (ids.length === 0 && names.length === 0) return { byId, byName };

  const found = (await db
    .db()
    .collection("gameItems")
    .find(
      {
        $or: [
          ...(ids.length > 0
            ? [{ "source.name": "scwiki", "source.id": { $in: ids } }]
            : []),
          ...(names.length > 0
            ? [{ name: { $in: names.map(nameMatcher) } }]
            : []),
        ],
      },
      { projection: { _id: 0, slug: 1, name: 1, variantName: 1, source: 1 } },
    )
    .toArray()) as unknown as ItemRef[];

  const rank = (item: ItemRef) =>
    `${item.variantName ? 1 : 0}${String(item.slug.length).padStart(4, "0")}${item.slug}`;
  for (const item of found.sort((a, b) => rank(a).localeCompare(rank(b)))) {
    if (item.source?.name === "scwiki" && item.source.id) {
      const id = item.source.id.toLowerCase();
      if (!byId.has(id)) byId.set(id, item.slug);
    }
    const key = wikeloNameKey(item.name);
    if (!byName.has(key)) byName.set(key, item.slug);
  }
  return { byId, byName };
}

/** Les fiches (objets, blueprints, missions) que ces échanges citent. */
async function toViews(docs: WikeloTrade[]): Promise<WikeloTradeView[]> {
  if (docs.length === 0) return [];
  const entries = docs.flatMap((doc) => [
    ...doc.requirements,
    ...doc.rewardChoices.flat(),
  ]);
  const blueprintIds = [
    ...new Set(docs.flatMap((doc) => doc.blueprintGameIds)),
  ];

  const [items, blueprintDocs, missionDocs] = await Promise.all([
    resolveItems(entries),
    blueprintIds.length > 0
      ? db
          .db()
          .collection("blueprints")
          .find(
            { gameId: { $in: blueprintIds } },
            { projection: { _id: 0, gameId: 1, slug: 1 } },
          )
          .toArray()
      : [],
    db
      .db()
      .collection("missions")
      .find(
        { gameIds: { $in: docs.map((doc) => doc.wikiId) } },
        { projection: { _id: 1, gameIds: 1, replacedBy: 1 } },
      )
      .toArray(),
  ]);

  const blueprintSlugs = new Map(
    blueprintDocs.map((doc) => [String(doc.gameId), String(doc.slug)]),
  );
  const missionIds = new Map<string, string>();
  for (const mission of missionDocs) {
    const id = String(mission.replacedBy ?? mission._id);
    for (const gameId of (mission.gameIds as string[] | undefined) ?? [])
      if (!missionIds.has(gameId)) missionIds.set(gameId, id);
  }

  const view = (entry: WikeloTradeEntry): WikeloTradeEntryView => {
    const itemSlug =
      (entry.wikiId && items.byId.get(entry.wikiId)) ||
      items.byName.get(wikeloNameKey(entry.name));
    return {
      name: entry.name,
      ...(entry.quantity !== undefined ? { quantity: entry.quantity } : {}),
      ...(entry.scu !== undefined ? { scu: entry.scu } : {}),
      ...(itemSlug ? { itemSlug } : {}),
    };
  };

  return docs.map((doc) => {
    const missionId = missionIds.get(doc.wikiId);
    return {
      id: doc.wikiId,
      title: doc.title,
      description: doc.description,
      requirements: doc.requirements.map(view),
      rewardChoices: doc.rewardChoices.map((group) => group.map(view)),
      blueprints: doc.blueprints.map((blueprint) => {
        const slug = blueprintSlugs.get(blueprint.gameId);
        return slug ? { ...blueprint, slug } : blueprint;
      }),
      ...(doc.reputation !== undefined ? { reputation: doc.reputation } : {}),
      onceOnly: doc.onceOnly,
      version: doc.version,
      ...(missionId ? { missionId } : {}),
    };
  });
}

const byTitle = (a: WikeloTrade, b: WikeloTrade) =>
  a.title.localeCompare(b.title);

/** Les clés sur lesquelles un objet est cherché dans les échanges. */
function itemKeys(item: Pick<Item, "name" | "source">) {
  const id =
    item.source?.name === "scwiki" && item.source.id
      ? item.source.id.toLowerCase()
      : undefined;
  return { id, name: wikeloNameKey(item.name) };
}

/** Les échanges qui donnent cet objet, et ceux qui le demandent. */
export async function getWikeloTradesForItem(
  item: Pick<Item, "name" | "source">,
): Promise<ItemWikeloTrades> {
  const { id, name } = itemKeys(item);
  const match = (ids: string, names: string) => ({
    ...ACTIVE,
    $or: [...(id ? [{ [ids]: id }] : []), { [names]: name }],
  });

  const [rewards, wanted] = await Promise.all([
    trades()
      .find(match("rewardIds", "rewardNames"), { projection: { _id: 0 } })
      .toArray(),
    trades()
      .find(match("requirementIds", "requirementNames"), {
        projection: { _id: 0 },
      })
      .toArray(),
  ]);

  const [rewardViews, wantedViews] = await Promise.all([
    toViews(rewards.sort(byTitle)),
    toViews(wanted.sort(byTitle)),
  ]);
  return { rewards: rewardViews, wanted: wantedViews };
}

/**
 * Les échanges qui donnent ce blueprint. Le GUID du jeu n'est pas dans la
 * fiche que renvoie `getBlueprintBySlug` : il est relu ici, par le slug.
 */
export async function getWikeloTradesForBlueprint(
  slug: string,
): Promise<WikeloTradeView[]> {
  const blueprint = await db
    .db()
    .collection("blueprints")
    .findOne({ slug }, { projection: { _id: 0, gameId: 1 } });
  const gameId =
    typeof blueprint?.gameId === "string" ? blueprint.gameId : undefined;
  if (!gameId) return [];
  const docs = await trades()
    .find(
      { ...ACTIVE, blueprintGameIds: gameId.toLowerCase() },
      { projection: { _id: 0 } },
    )
    .toArray();
  return toViews(docs.sort(byTitle));
}

/**
 * Les échanges dont le titre, un objet demandé ou un objet donné contient ces
 * mots ; tous, sans requête. `role` limite la recherche à ce que Wikelo donne
 * (`reward`) ou à ce qu'il demande (`requirement`).
 */
export async function searchWikeloTrades(options: {
  query?: string;
  role?: "reward" | "requirement";
  limit?: number;
}): Promise<{ total: number; trades: WikeloTradeView[] }> {
  const limit = Math.min(
    Math.max(1, options.limit ?? WIKELO_SEARCH_LIMIT.default),
    WIKELO_SEARCH_LIMIT.max,
  );
  const words = (options.query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const fields =
    options.role === "reward"
      ? ["rewardNames"]
      : options.role === "requirement"
        ? ["requirementNames"]
        : ["title", "rewardNames", "requirementNames"];
  const filter =
    words.length === 0
      ? ACTIVE
      : {
          ...ACTIVE,
          $and: words.map((word) => ({
            $or: fields.map((field) => ({
              [field]: { $regex: escapeRegex(word), $options: "i" },
            })),
          })),
        };

  const [total, docs] = await Promise.all([
    trades().countDocuments(filter),
    trades()
      .find(filter, { projection: { _id: 0 } })
      .sort({ title: 1 })
      .limit(limit)
      .toArray(),
  ]);
  return { total, trades: await toViews(docs) };
}
