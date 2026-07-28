import "server-only";

import { ObjectId } from "bson";
import type { Document } from "bson";
import db from "@/lib/db";
import { getAvailableTransports } from "@/lib/cargo-ships";
import {
  DEFAULT_SEARCH_LIMIT,
  MIN_SEARCH_QUERY_LENGTH,
  PRIVATE_SEARCH_TYPES,
  SEARCH_TYPES,
  type SearchResult,
  type SearchType,
} from "@/types/search";

/**
 * How many documents are read per type before scoring. Mongo returns matches in
 * natural order, so scoring only the first `limit` documents would rank a
 * candidate pool rather than the actual best matches.
 */
const CANDIDATE_FACTOR = 4;
const MAX_CANDIDATES = 100;

/**
 * Escapes regex metacharacters so a search term is matched literally.
 * This search is publicly reachable, so an unescaped `$regex` would let a
 * caller change the matching semantics or send a pathological pattern.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EXACT_SCORE = 100;
const PREFIX_SCORE = 60;
const WORD_SCORE = 40;
const PARTIAL_SCORE = 20;

/** Characters that make the next character the start of a word. */
const WORD_BOUNDARY = /[\s\-_/\\(),.:'"[\]]/;

function fieldScore(field: unknown, needle: string): number {
  if (typeof field !== "string" || !field) {
    return 0;
  }

  const value = field.toLowerCase();
  const index = value.indexOf(needle);

  if (index < 0) {
    return 0;
  }
  if (value === needle) {
    return EXACT_SCORE;
  }
  if (index === 0) {
    return PREFIX_SCORE;
  }
  if (WORD_BOUNDARY.test(value[index - 1])) {
    return WORD_SCORE;
  }

  return PARTIAL_SCORE;
}

/**
 * Relevance of a document. The title weighs twice as much as the secondary
 * fields so a mission whose title matches outranks one that only mentions the
 * term in its description.
 */
function relevance(
  needle: string,
  title: unknown,
  ...secondary: unknown[]
): number {
  return (
    fieldScore(title, needle) * 2 +
    Math.max(0, ...secondary.map((field) => fieldScore(field, needle)))
  );
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

type SearchContext = {
  /** Lower-cased query, used for scoring. */
  needle: string;
  /** Case-insensitive matcher injected in the Mongo queries. */
  matcher: { $regex: string; $options: string };
  /** How many documents to read before scoring. */
  candidates: number;
  /** Set when the caller is authenticated; unlocks their own private data. */
  userId?: string;
};

type Fetcher = (context: SearchContext) => Promise<SearchResult[]>;

async function searchBlueprints({
  matcher,
  candidates,
  needle,
}: SearchContext): Promise<SearchResult[]> {
  const docs = await db
    .db()
    .collection("blueprints")
    .find({
      $or: [
        { name: matcher },
        { description: matcher },
        { obtention: matcher },
      ],
    })
    .project({
      name: 1,
      slug: 1,
      description: 1,
      category: 1,
      subcategory: 1,
      imageUrl: 1,
      obtention: 1,
      tier: 1,
    })
    .limit(candidates)
    .toArray();

  return docs.map((doc) => ({
    type: "blueprint" as const,
    id: doc._id.toString(),
    title: doc.name,
    subtitle:
      [doc.category, doc.subcategory].filter(Boolean).join(" › ") || undefined,
    description: nonEmpty(doc.description),
    url: `/crafting/blueprints/${doc.slug}`,
    imageUrl: nonEmpty(doc.imageUrl),
    meta: typeof doc.tier === "number" ? { tier: doc.tier } : undefined,
    score: relevance(needle, doc.name, doc.description, doc.obtention),
  }));
}

async function searchMissions({
  matcher,
  candidates,
  needle,
}: SearchContext): Promise<SearchResult[]> {
  const docs = await db
    .db()
    .collection("missions")
    .aggregate([
      { $match: { $or: [{ title: matcher }, { description: matcher }] } },
      { $limit: candidates },
      {
        $lookup: {
          from: "factions",
          localField: "factionId",
          foreignField: "_id",
          as: "faction",
        },
      },
      { $unwind: { path: "$faction", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          title: 1,
          description: 1,
          category: 1,
          missionType: 1,
          rewardUEC: 1,
          illegal: 1,
          "faction.name": 1,
        },
      },
    ])
    .toArray();

  return docs.map((doc) => ({
    type: "mission" as const,
    id: doc._id.toString(),
    title: doc.title,
    subtitle: nonEmpty(doc.faction?.name) ?? nonEmpty(doc.category),
    description: nonEmpty(doc.description),
    url: `/missions/${doc._id.toString()}`,
    meta: {
      ...(typeof doc.missionType === "string"
        ? { missionType: doc.missionType }
        : {}),
      ...(typeof doc.rewardUEC === "number"
        ? { rewardUEC: doc.rewardUEC }
        : {}),
      illegal: doc.illegal === true,
    },
    score: relevance(needle, doc.title, doc.description),
  }));
}

async function searchFactions({
  matcher,
  candidates,
  needle,
}: SearchContext): Promise<SearchResult[]> {
  const docs = await db
    .db()
    .collection("factions")
    .find({ name: matcher })
    .project({ name: 1 })
    .limit(candidates)
    .toArray();

  return docs.map((doc) => ({
    type: "faction" as const,
    id: doc._id.toString(),
    title: doc.name,
    url: `/missions/factions/${doc._id.toString()}`,
    score: relevance(needle, doc.name),
  }));
}

async function searchShopItems({
  matcher,
  candidates,
  needle,
}: SearchContext): Promise<SearchResult[]> {
  const docs = await db
    .db()
    .collection("shopItems")
    .aggregate([
      { $match: { $or: [{ name: matcher }, { description: matcher }] } },
      { $limit: candidates },
      {
        $lookup: {
          from: "shops",
          localField: "shopId",
          foreignField: "id",
          as: "shop",
          pipeline: [{ $project: { _id: 0, id: 1, name: 1 } }],
        },
      },
      { $unwind: { path: "$shop", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: 1,
          name: 1,
          description: 1,
          image: 1,
          price: 1,
          stock: 1,
          type: 1,
          shop: 1,
        },
      },
    ])
    .toArray();

  return docs.map((doc) => ({
    type: "shopItem" as const,
    id: doc.id,
    title: doc.name,
    subtitle: nonEmpty(doc.shop?.name),
    description: nonEmpty(doc.description),
    url: `/shopping/i/${doc.id}`,
    imageUrl: nonEmpty(doc.image),
    meta: {
      ...(doc.price !== undefined && doc.price !== null
        ? { price: String(doc.price) }
        : {}),
      ...(typeof doc.stock === "number" ? { stock: doc.stock } : {}),
      ...(typeof doc.type === "string" ? { itemType: doc.type } : {}),
      ...(nonEmpty(doc.shop?.id) ? { shopId: doc.shop.id } : {}),
    },
    score: relevance(needle, doc.name, doc.description),
  }));
}

async function searchShops({
  matcher,
  candidates,
  needle,
}: SearchContext): Promise<SearchResult[]> {
  const docs = await db
    .db()
    .collection("shops")
    .find({ $or: [{ name: matcher }, { description: matcher }] })
    .project({ id: 1, name: 1, description: 1 })
    .limit(candidates)
    .toArray();

  return docs.map((doc) => ({
    type: "shop" as const,
    id: doc.id,
    title: doc.name,
    description: nonEmpty(doc.description),
    url: `/shops/${doc.id}`,
    score: relevance(needle, doc.name, doc.description),
  }));
}

/**
 * Public organizations, plus the private ones the caller is a member of.
 * Members and join codes are never projected: they are not searchable data.
 */
async function searchOrganizations({
  matcher,
  candidates,
  needle,
  userId,
}: SearchContext): Promise<SearchResult[]> {
  const visibility: Document[] = [{ public: true }];
  if (userId && ObjectId.isValid(userId)) {
    visibility.push({ "members.userId": new ObjectId(userId) });
  }

  const docs = await db
    .db()
    .collection("organizations")
    .find({
      $and: [
        { $or: visibility },
        {
          $or: [{ name: matcher }, { tag: matcher }, { description: matcher }],
        },
      ],
    })
    .project({ name: 1, tag: 1, description: 1, image: 1, public: 1 })
    .limit(candidates)
    .toArray();

  return docs.map((doc) => ({
    type: "organization" as const,
    id: doc._id.toString(),
    title: doc.name,
    subtitle: nonEmpty(doc.tag),
    description: nonEmpty(doc.description),
    url: `/orgs/${doc._id.toString()}`,
    imageUrl: nonEmpty(doc.image),
    meta: { public: doc.public === true },
    score: relevance(needle, doc.name, doc.tag, doc.description),
  }));
}

/**
 * Ships come from `getAvailableTransports` rather than from the collection so
 * the built-in fallback list is searchable on a database with no ship stored.
 */
async function searchCargoShips({
  needle,
  candidates,
}: SearchContext): Promise<SearchResult[]> {
  const transports = await getAvailableTransports();

  return transports
    .filter((transport) => transport.name.toLowerCase().includes(needle))
    .slice(0, candidates)
    .map((transport) => ({
      type: "cargoShip" as const,
      id: transport.id,
      title: transport.name,
      subtitle: `${transport.capacity} SCU`,
      url: "/industry/cargo",
      meta: { capacity: transport.capacity },
      score: relevance(needle, transport.name),
    }));
}

/** Inventory is private: only the caller's own items are ever returned. */
async function searchInventoryItems({
  matcher,
  candidates,
  needle,
  userId,
}: SearchContext): Promise<SearchResult[]> {
  if (!userId) {
    return [];
  }

  const docs = await db
    .db()
    .collection("inventoryItems")
    .aggregate([
      {
        $match: {
          userId,
          $or: [{ name: matcher }, { description: matcher }],
        },
      },
      { $limit: candidates },
      {
        $lookup: {
          from: "locations",
          let: { locationId: "$locationId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: [{ $toString: "$_id" }, "$$locationId"] },
              },
            },
            { $limit: 1 },
            { $project: { _id: 0, name: 1 } },
          ],
          as: "location",
        },
      },
      { $unwind: { path: "$location", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: 1,
          description: 1,
          quantity: 1,
          unit: 1,
          quality: 1,
          location: 1,
        },
      },
    ])
    .toArray();

  return docs.map((doc) => ({
    type: "inventoryItem" as const,
    id: doc._id.toString(),
    title: doc.name,
    subtitle: nonEmpty(doc.location?.name),
    description: nonEmpty(doc.description),
    url: "/inventory",
    meta: {
      ...(typeof doc.quantity === "number" ? { quantity: doc.quantity } : {}),
      ...(nonEmpty(doc.unit) ? { unit: doc.unit } : {}),
      ...(typeof doc.quality === "number" ? { quality: doc.quality } : {}),
    },
    score: relevance(needle, doc.name, doc.description),
  }));
}

const FETCHERS: Record<SearchType, Fetcher> = {
  blueprint: searchBlueprints,
  mission: searchMissions,
  faction: searchFactions,
  shopItem: searchShopItems,
  shop: searchShops,
  organization: searchOrganizations,
  cargoShip: searchCargoShips,
  inventoryItem: searchInventoryItems,
};

const TYPE_ORDER = new Map(SEARCH_TYPES.map((type, index) => [type, index]));

/** Score first, then the declaration order of the types, then the title. */
function compareResults(a: SearchResult, b: SearchResult): number {
  return (
    b.score - a.score ||
    (TYPE_ORDER.get(a.type) ?? 0) - (TYPE_ORDER.get(b.type) ?? 0) ||
    a.title.localeCompare(b.title)
  );
}

export type SearchEverythingOptions = {
  query: string;
  /** Types to search. Defaults to all of them. */
  types?: SearchType[];
  /** Maximum number of results per type. */
  limit?: number;
  userId?: string;
};

export type SearchEverythingResult = {
  types: SearchType[];
  results: SearchResult[];
  countsByType: Record<string, number>;
  hasMore: SearchType[];
};

/**
 * Searches every data source of the app at once and returns a single list of
 * results ranked by relevance. Each type is capped at `limit` results so a
 * collection with many matches cannot bury the others.
 */
export async function searchEverything({
  query,
  types = [...SEARCH_TYPES],
  limit = DEFAULT_SEARCH_LIMIT,
  userId,
}: SearchEverythingOptions): Promise<SearchEverythingResult> {
  const trimmed = query.trim();

  // A shorter term would match nearly every document of every collection.
  // The route already rejects it, but this is reachable from anywhere.
  if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
    return { types: [], results: [], countsByType: {}, hasMore: [] };
  }

  // A duplicated type would run its query twice and repeat its results, and a
  // non-positive limit would make Mongo return whole collections.
  const wanted = [...new Set(types)];
  const perTypeLimit = Math.max(1, Math.floor(limit));

  // Types reading private data are dropped for anonymous callers instead of
  // returning an error: the rest of the search stays useful.
  const searched = userId
    ? wanted
    : wanted.filter((type) => !PRIVATE_SEARCH_TYPES.includes(type));

  const context: SearchContext = {
    needle: trimmed.toLowerCase(),
    matcher: { $regex: escapeRegex(trimmed), $options: "i" },
    candidates: Math.min(MAX_CANDIDATES, perTypeLimit * CANDIDATE_FACTOR),
    userId,
  };

  const perType = await Promise.all(
    searched.map((type) => FETCHERS[type](context)),
  );

  const results: SearchResult[] = [];
  const countsByType: Record<string, number> = {};
  const hasMore: SearchType[] = [];

  searched.forEach((type, index) => {
    const matches = perType[index].sort(compareResults);
    const kept = matches.slice(0, perTypeLimit);

    results.push(...kept);
    countsByType[type] = kept.length;

    // The candidate pool is larger than `limit`, so an overflow here means the
    // collection really has more matches than what is returned.
    if (matches.length > perTypeLimit) {
      hasMore.push(type);
    }
  });

  return {
    types: searched,
    results: results.sort(compareResults),
    countsByType,
    hasMore,
  };
}
