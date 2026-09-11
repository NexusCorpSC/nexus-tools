import "server-only";

import type { Document } from "bson";
import type { UpdateFilter } from "mongodb";
import db from "@/lib/db";
import {
  ITEM_PAGE_SIZE,
  MAX_ITEM_NAME_LENGTH,
  MAX_ITEM_PAGE_SIZE,
  MAX_ITEM_TEXT_LENGTH,
  isItemKind,
  toItemSlug,
  type Item,
  type ItemBlueprintLink,
  type ItemDetails,
  type ItemFacets,
  type ItemKind,
  type ItemStatistics,
  type ItemSummary,
} from "@/types/items";

const COLLECTION = "gameItems";
const BLUEPRINTS_COLLECTION = "blueprints";

type ItemDbModel = Item;

function collection() {
  return db.db().collection<ItemDbModel>(COLLECTION);
}

let indexesReady: Promise<unknown> | null = null;

/**
 * The slug is what every page and every link targets, so its uniqueness is
 * enforced by the database rather than by a read-then-write check that two
 * concurrent creates could both pass.
 */
function ensureIndexes() {
  indexesReady ??= Promise.all([
    collection().createIndex(
      { slug: 1 },
      { unique: true, name: "gameItems_slug_unique" },
    ),
    collection().createIndex({ id: 1 }, { name: "gameItems_id" }),
    collection().createIndex(
      { variantGroup: 1 },
      { name: "gameItems_variant" },
    ),
    collection().createIndex({ setId: 1 }, { name: "gameItems_set" }),
  ]).catch((error) => {
    // Let the next call retry instead of caching a transient failure.
    indexesReady = null;
    throw error;
  });

  return indexesReady;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * Escapes regex metacharacters: these filters are publicly reachable, so an
 * unescaped `$regex` would let a caller change the matching semantics or send
 * a pathological pattern.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function text(value: unknown, maxLength = MAX_ITEM_TEXT_LENGTH): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(
  value: unknown,
  maxLength = MAX_ITEM_TEXT_LENGTH,
): string | undefined {
  return text(value, maxLength) || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeStatistics(value: unknown): ItemStatistics | undefined {
  if (!value || typeof value !== "object") return undefined;

  const statistics: ItemStatistics = {};
  for (const [rawName, rawStat] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const name = text(rawName, MAX_ITEM_NAME_LENGTH);
    if (!name || !rawStat || typeof rawStat !== "object") continue;

    const { value: statValue, unit } = rawStat as {
      value?: unknown;
      unit?: unknown;
    };
    if (typeof statValue !== "string" && typeof statValue !== "number") {
      continue;
    }
    const normalizedValue =
      typeof statValue === "string"
        ? text(statValue, MAX_ITEM_NAME_LENGTH)
        : statValue;
    if (normalizedValue === "") continue;

    statistics[name] = {
      value: normalizedValue,
      ...(optionalText(unit, 24) ? { unit: text(unit, 24) } : {}),
    };
  }

  return Object.keys(statistics).length > 0 ? statistics : undefined;
}

function normalizeSlugList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const slugs = [
    ...new Set(
      value
        .map((entry) => text(entry, MAX_ITEM_NAME_LENGTH))
        .filter((entry): entry is string => !!entry),
    ),
  ];

  return slugs.length > 0 ? slugs : undefined;
}

export type ItemInput = {
  name: string;
  slug?: string;
  kind: string;
  description?: string;
  category: string;
  subcategory?: string;
  manufacturer?: string;
  size?: number | string;
  tier?: number | string;
  imageUrl?: string;
  statistics?: unknown;
  obtention?: string;
  blueprintSlugs?: unknown;
  variantGroup?: string;
  variantName?: string;
  setId?: string;
  setName?: string;
};

type NormalizedItem = Omit<Item, "id" | "createdAt" | "updatedAt">;

/**
 * Validates and cleans what a form sent. Everything optional that comes back
 * empty is dropped rather than stored as `""`, so the filters and the detail
 * page only ever see meaningful values.
 */
export function normalizeItemInput(input: ItemInput): NormalizedItem {
  const name = text(input.name, MAX_ITEM_NAME_LENGTH);
  if (!name) {
    throw new Error("Le nom de l'objet est obligatoire");
  }

  const kind = text(input.kind, 24);
  if (!isItemKind(kind)) {
    throw new Error("Type d'objet invalide");
  }

  const category = text(input.category, MAX_ITEM_NAME_LENGTH);
  if (!category) {
    throw new Error("La catégorie est obligatoire");
  }

  const slug = toItemSlug(text(input.slug, MAX_ITEM_NAME_LENGTH) || name);
  if (!slug) {
    throw new Error("Le slug est obligatoire");
  }

  const setName = optionalText(input.setName, MAX_ITEM_NAME_LENGTH);
  const setId = toItemSlug(
    text(input.setId, MAX_ITEM_NAME_LENGTH) || setName || "",
  );
  const variantGroup = toItemSlug(
    text(input.variantGroup, MAX_ITEM_NAME_LENGTH),
  );

  return {
    name,
    slug,
    kind: kind as ItemKind,
    category,
    description: optionalText(input.description),
    subcategory: optionalText(input.subcategory, MAX_ITEM_NAME_LENGTH),
    manufacturer: optionalText(input.manufacturer, MAX_ITEM_NAME_LENGTH),
    size: optionalNumber(input.size),
    tier: optionalNumber(input.tier),
    imageUrl: optionalText(input.imageUrl, 2048),
    statistics: normalizeStatistics(input.statistics),
    obtention: optionalText(input.obtention),
    blueprintSlugs: normalizeSlugList(input.blueprintSlugs),
    variantGroup: variantGroup || undefined,
    variantName: optionalText(input.variantName, MAX_ITEM_NAME_LENGTH),
    setId: setId || undefined,
    setName: setId ? (setName ?? setId) : undefined,
  };
}

const SUMMARY_PROJECTION = {
  _id: 0,
  id: 1,
  slug: 1,
  name: 1,
  kind: 1,
  category: 1,
  subcategory: 1,
  manufacturer: 1,
  imageUrl: 1,
  tier: 1,
  variantName: 1,
  setName: 1,
} as const;

export type ItemFilters = {
  query?: string;
  kind?: string;
  category?: string;
  subcategory?: string;
  manufacturer?: string;
  setId?: string;
  variantGroup?: string;
  limit?: number;
  page?: number;
};

function buildFilter({
  query,
  kind,
  category,
  subcategory,
  manufacturer,
  setId,
  variantGroup,
}: ItemFilters): Document {
  const conditions: Document[] = [];

  if (query?.trim()) {
    const matcher = { $regex: escapeRegex(query.trim()), $options: "i" };
    conditions.push({
      $or: [
        { name: matcher },
        { description: matcher },
        { manufacturer: matcher },
        { variantName: matcher },
        { setName: matcher },
      ],
    });
  }
  if (kind && isItemKind(kind)) conditions.push({ kind });
  if (category) conditions.push({ category });
  if (subcategory) conditions.push({ subcategory });
  if (manufacturer) conditions.push({ manufacturer });
  if (setId) conditions.push({ setId });
  if (variantGroup) conditions.push({ variantGroup });

  return conditions.length > 0 ? { $and: conditions } : {};
}

/** Browse/search entry point, paginated and sorted by name. */
export async function filterItems(
  filters: ItemFilters = {},
): Promise<{ items: ItemSummary[]; total: number }> {
  const limit = Math.max(
    1,
    Math.min(MAX_ITEM_PAGE_SIZE, filters.limit ?? ITEM_PAGE_SIZE),
  );
  const page = Math.max(1, filters.page ?? 1);
  const filter = buildFilter(filters);

  const [items, total] = await Promise.all([
    collection()
      .find(filter, { projection: SUMMARY_PROJECTION })
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    collection().countDocuments(filter),
  ]);

  return { items: items as ItemSummary[], total };
}

export async function getItemBySlug(slug: string): Promise<Item | null> {
  const item = await collection().findOne({ slug }, { projection: { _id: 0 } });
  return item ?? null;
}

async function listSiblings(
  field: "variantGroup" | "setId",
  value: string,
): Promise<ItemSummary[]> {
  const siblings = await collection()
    .find({ [field]: value }, { projection: SUMMARY_PROJECTION })
    .sort({ name: 1 })
    .toArray();

  // A group of one is the item itself: nothing to show as a variant or a set.
  return siblings.length > 1 ? (siblings as ItemSummary[]) : [];
}

function toBlueprintLink(doc: Document): ItemBlueprintLink {
  return {
    slug: doc.slug,
    name: doc.name,
    category: doc.category ?? undefined,
    subcategory: doc.subcategory ?? undefined,
    imageUrl: doc.imageUrl ?? undefined,
    tier: typeof doc.tier === "number" ? doc.tier : undefined,
  };
}

const BLUEPRINT_PROJECTION = {
  _id: 0,
  slug: 1,
  name: 1,
  category: 1,
  subcategory: 1,
  imageUrl: 1,
  tier: 1,
} as const;

/**
 * Blueprints crafting this item. Declared slugs win; without any, blueprints
 * carrying exactly the same name are proposed, which covers the items imported
 * before anyone linked them by hand.
 */
export async function getBlueprintsForItem(
  item: Pick<Item, "name" | "blueprintSlugs">,
): Promise<{ blueprints: ItemBlueprintLink[]; inferred: boolean }> {
  const blueprints = db.db().collection(BLUEPRINTS_COLLECTION);

  if (item.blueprintSlugs && item.blueprintSlugs.length > 0) {
    const docs = await blueprints
      .find(
        { slug: { $in: item.blueprintSlugs } },
        { projection: BLUEPRINT_PROJECTION },
      )
      .toArray();

    return { blueprints: docs.map(toBlueprintLink), inferred: false };
  }

  const docs = await blueprints
    .find(
      { name: { $regex: `^${escapeRegex(item.name)}$`, $options: "i" } },
      { projection: BLUEPRINT_PROJECTION },
    )
    .limit(10)
    .toArray();

  return { blueprints: docs.map(toBlueprintLink), inferred: docs.length > 0 };
}

/** Everything the detail page shows: the item, its blueprints, variants and set. */
export async function getItemDetails(
  slug: string,
): Promise<ItemDetails | null> {
  const item = await getItemBySlug(slug);
  if (!item) return null;

  const [{ blueprints, inferred }, variants, setItems] = await Promise.all([
    getBlueprintsForItem(item),
    item.variantGroup ? listSiblings("variantGroup", item.variantGroup) : [],
    item.setId ? listSiblings("setId", item.setId) : [],
  ]);

  return {
    ...item,
    blueprints,
    blueprintsInferred: inferred,
    variants,
    setItems,
  };
}

export async function getItemFacets(): Promise<ItemFacets> {
  const [facets] = await collection()
    .aggregate<{
      categories: { _id: string; subcategories: (string | null)[] }[];
      manufacturers: { _id: string }[];
      variantGroups: { _id: string; name?: string | null }[];
      sets: { _id: string; name?: string | null }[];
    }>([
      {
        $facet: {
          categories: [
            { $match: { category: { $nin: [null, ""] } } },
            {
              $group: {
                _id: "$category",
                subcategories: { $addToSet: "$subcategory" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          manufacturers: [
            { $match: { manufacturer: { $nin: [null, ""] } } },
            { $group: { _id: "$manufacturer" } },
            { $sort: { _id: 1 } },
          ],
          variantGroups: [
            { $match: { variantGroup: { $nin: [null, ""] } } },
            { $group: { _id: "$variantGroup" } },
            { $sort: { _id: 1 } },
          ],
          sets: [
            { $match: { setId: { $nin: [null, ""] } } },
            { $group: { _id: "$setId", name: { $first: "$setName" } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ])
    .toArray();

  return {
    categories: (facets?.categories ?? []).map((entry) => ({
      category: entry._id,
      subcategories: entry.subcategories
        .filter((sub): sub is string => !!sub)
        .sort((a, b) => a.localeCompare(b)),
    })),
    manufacturers: (facets?.manufacturers ?? []).map((entry) => entry._id),
    variantGroups: (facets?.variantGroups ?? []).map((entry) => ({
      id: entry._id,
      name: entry._id,
    })),
    sets: (facets?.sets ?? []).map((entry) => ({
      id: entry._id,
      name: entry.name ?? entry._id,
    })),
  };
}

export async function createItem(input: ItemInput): Promise<Item> {
  const normalized = normalizeItemInput(input);
  await ensureIndexes();

  const { nanoid } = await import("nanoid");
  const now = new Date().toISOString();
  const item: Item = {
    ...normalized,
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
  };

  try {
    // Empty optional fields are left out rather than inserted: the driver
    // stores `undefined` as `null`, which would then be served as such by the
    // API and would defeat the `$nin: [null, ""]` filters building the facets.
    await collection().insertOne(
      Object.fromEntries(
        Object.entries(item).filter(([, value]) => value !== undefined),
      ) as ItemDbModel,
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error(`Un objet utilise déjà le slug « ${item.slug} »`);
    }
    throw error;
  }

  return item;
}

export async function updateItem(
  currentSlug: string,
  input: ItemInput,
): Promise<Item> {
  const normalized = normalizeItemInput(input);
  await ensureIndexes();

  const entries = Object.entries(normalized) as [
    keyof NormalizedItem,
    unknown,
  ][];

  // A field the form left empty is removed rather than written as `undefined`
  // (which the driver would store as `null`), otherwise the old value would
  // survive an edit meant to clear it — and `$set` and `$unset` cannot both
  // carry the same path.
  const $set: Document = Object.fromEntries(
    entries.filter(([, value]) => value !== undefined),
  );
  const $unset: Document = Object.fromEntries(
    entries
      .filter(([, value]) => value === undefined)
      .map(([key]) => [key, ""]),
  );

  try {
    const updated = await collection().findOneAndUpdate(
      { slug: currentSlug },
      {
        $set: { ...$set, updatedAt: new Date().toISOString() },
        ...(Object.keys($unset).length > 0 ? { $unset } : {}),
      } as UpdateFilter<ItemDbModel>,
      { returnDocument: "after", projection: { _id: 0 } },
    );

    if (!updated) {
      throw new Error("Objet introuvable");
    }

    return updated as Item;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error(`Un objet utilise déjà le slug « ${normalized.slug} »`);
    }
    throw error;
  }
}

export async function deleteItem(slug: string): Promise<boolean> {
  const result = await collection().deleteOne({ slug });
  return result.deletedCount > 0;
}
