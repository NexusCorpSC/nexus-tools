import "server-only";
import { ObjectId, type Document, type Filter } from "mongodb";
import db from "@/lib/db";
import { placeMedia } from "@/lib/contribution-store";
import { mostViewed, type ViewedType } from "@/lib/page-views";
import { POINTS, STALE_DATA_DAYS } from "@/types/contributions";

/**
 * « Ce qui manque » : les trous du catalogue, les plus visités d'abord. Une
 * fiche que personne n'ouvre peut attendre ; celle que cent joueurs ouvrent
 * sans y trouver d'image, non.
 */

export const MISSING_KINDS = [
  "placeImage",
  "placePlan",
  "itemSection",
  "stalePrices",
  "missionPlace",
] as const;
export type MissingKind = (typeof MISSING_KINDS)[number];

export function isMissingKind(value: unknown): value is MissingKind {
  return (MISSING_KINDS as readonly unknown[]).includes(value);
}

export type MissingEntry = {
  slug: string;
  name: string;
  /** Où se trouve la fiche, ou ce qu'elle est. */
  detail?: string;
  href: string;
  /** Où combler le trou. */
  fillHref: string;
  /** Ce que le combler rapporte, au moins. */
  points: number;
  /** Visites sur 30 jours. */
  views: number;
};

/** Les lieux qui méritent un plan : on y entre et on s'y perd. */
const PLANNED_TYPES = ["station", "spaceport", "outpost", "building"];

const DAY_MS = 24 * 60 * 60 * 1000;

type Source = {
  collection: string;
  viewed: ViewedType;
  /** La clé que portent les visites : le slug, ou l'identifiant d'une mission. */
  key: "slug" | "_id";
  filter: () => Promise<Filter<Document>>;
  projection: Document;
  toEntry: (doc: Document) => Omit<MissingEntry, "views">;
};

const SOURCES: Record<MissingKind, Source> = {
  placeImage: {
    collection: "gameLocations",
    viewed: "place",
    key: "slug",
    filter: async () => {
      // Une image en galerie suffit : la vignette suivra.
      const pictured = await placeMedia().distinct("placeSlug", {
        status: "published",
      });
      return {
        imageUrl: { $in: [null, ""] },
        slug: { $nin: pictured },
        type: { $nin: ["star"] },
      };
    },
    projection: { slug: 1, name: 1, parentName: 1, systemName: 1 },
    toEntry: (doc) => ({
      slug: doc.slug,
      name: doc.name,
      detail: [doc.systemName, doc.parentName].filter(Boolean).join(" › "),
      href: `/lieux/${doc.slug}`,
      fillHref: `/lieux/${doc.slug}`,
      points: POINTS.media + POINTS.firstMedia,
    }),
  },
  placePlan: {
    collection: "gameLocations",
    viewed: "place",
    key: "slug",
    filter: async () => ({
      type: { $in: PLANNED_TYPES },
      planCount: { $in: [0, null] },
    }),
    projection: { slug: 1, name: 1, parentName: 1, systemName: 1 },
    toEntry: (doc) => ({
      slug: doc.slug,
      name: doc.name,
      detail: [doc.systemName, doc.parentName].filter(Boolean).join(" › "),
      href: `/lieux/${doc.slug}?onglet=plan`,
      fillHref: `/lieux/${doc.slug}/contribuer/plan`,
      points: POINTS.planImage,
    }),
  },
  itemSection: {
    collection: "gameItems",
    viewed: "item",
    key: "slug",
    filter: async () => ({
      $or: [
        { kind: "vehicle", vehicle: { $exists: false } },
        { kind: "weapon", weapon: { $exists: false } },
        { kind: "resource", resource: { $exists: false } },
      ],
    }),
    projection: { slug: 1, name: 1, category: 1, subcategory: 1 },
    toEntry: (doc) => ({
      slug: doc.slug,
      name: doc.name,
      detail: [doc.category, doc.subcategory].filter(Boolean).join(" · "),
      href: `/items/${doc.slug}`,
      fillHref: `/items/${doc.slug}/contribuer`,
      points: POINTS.section,
    }),
  },
  stalePrices: {
    collection: "gameItems",
    viewed: "item",
    key: "slug",
    filter: async () => ({
      kind: "resource",
      "resource.markets.0": { $exists: true },
      $or: [
        { "resource.pricesUpdatedAt": { $exists: false } },
        {
          "resource.pricesUpdatedAt": {
            $lt: new Date(Date.now() - STALE_DATA_DAYS * DAY_MS).toISOString(),
          },
        },
      ],
    }),
    projection: { slug: 1, name: 1, "resource.pricesUpdatedAt": 1 },
    toEntry: (doc) => ({
      slug: doc.slug,
      name: doc.name,
      detail: doc.resource?.pricesUpdatedAt,
      href: `/items/${doc.slug}`,
      fillHref: `/items/${doc.slug}`,
      points: POINTS.confirm,
    }),
  },
  missionPlace: {
    collection: "missions",
    viewed: "mission",
    key: "_id",
    filter: async () => ({
      removedInVersion: { $exists: false },
      replacedBy: { $exists: false },
      placeSlugs: { $exists: false },
    }),
    projection: { title: 1, category: 1, missionType: 1 },
    toEntry: (doc) => ({
      slug: String(doc._id),
      name: doc.title,
      detail: [doc.missionType, doc.category].filter(Boolean).join(" · "),
      href: `/missions/${doc._id}`,
      fillHref: `/missions/${doc._id}/contribuer`,
      points: POINTS.edit,
    }),
  },
};

/**
 * Les trous d'une sorte, les plus visités d'abord ; au-delà de ce qui a été
 * visité, les autres par ordre alphabétique. `total` compte tous les trous.
 */
export async function listMissing(
  kind: MissingKind,
  limit = 30,
): Promise<{ entries: MissingEntry[]; total: number }> {
  const source = SOURCES[kind];
  const collection = db.db().collection(source.collection);
  const [filter, views] = await Promise.all([
    source.filter(),
    mostViewed(source.viewed),
  ]);

  const viewedKeys = [...views.keys()];
  const keyValues =
    source.key === "_id"
      ? viewedKeys
          .filter((key) => /^[0-9a-f]{24}$/i.test(key))
          .map((key) => new ObjectId(key))
      : viewedKeys;

  const [visited, total] = await Promise.all([
    viewedKeys.length > 0
      ? collection
          .find(
            { $and: [filter, { [source.key]: { $in: keyValues } }] },
            { projection: source.projection },
          )
          .toArray()
      : [],
    collection.countDocuments(filter),
  ]);

  const entries = visited
    .map((doc) => {
      const entry = source.toEntry(doc);
      return { ...entry, views: views.get(entry.slug) ?? 0 };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);

  if (entries.length < limit) {
    const seen = entries.map((entry) =>
      source.key === "_id" ? new ObjectId(entry.slug) : entry.slug,
    );
    const rest = await collection
      .find(
        { $and: [filter, { [source.key]: { $nin: seen } }] },
        { projection: source.projection },
      )
      .sort(source.collection === "missions" ? { title: 1 } : { name: 1 })
      .limit(limit - entries.length)
      .toArray();
    entries.push(...rest.map((doc) => ({ ...source.toEntry(doc), views: 0 })));
  }

  return { entries, total };
}
