import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import type { MissionDb } from "@/lib/data/missions";
import { toPlaceSlug } from "@/types/places";
import {
  MAX_MISSION_PLACES,
  MAX_MISSION_TIP_LENGTH,
} from "@/types/contributions";

/**
 * Ce que la communauté ajoute à une mission : où elle se joue, et une astuce.
 * L'import (`scripts/import-game-data.ts`) n'écrit que les champs qui viennent
 * de la source : ceux-là survivent à chaque mise à jour du jeu.
 */
export type MissionCommunity = {
  placeSlugs?: string[];
  tip?: string;
};

export const MISSION_FIELDS = ["placeSlugs", "tip"] as const;
export type MissionField = (typeof MISSION_FIELDS)[number];

type MissionDoc = MissionDb & MissionCommunity & { updatedAt?: Date };

const missions = () => db.db().collection<MissionDoc>("missions");

export type MissionForEdit = MissionCommunity & {
  id: string;
  title: string;
};

export async function getMissionForEdit(
  id: string,
): Promise<MissionForEdit | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await missions().findOne(
    { _id: new ObjectId(id) },
    { projection: { title: 1, placeSlugs: 1, tip: 1 } },
  );
  if (!doc) return null;
  return {
    id: String(doc._id),
    title: doc.title,
    placeSlugs: doc.placeSlugs,
    tip: doc.tip,
  };
}

/** Lève avec un message pour l'auteur, comme les validations des lieux. */
export function normalizeMissionInput(input: unknown): MissionCommunity {
  const raw = (input ?? {}) as Record<string, unknown>;
  const places = Array.isArray(raw.placeSlugs) ? raw.placeSlugs : [];
  if (places.length > MAX_MISSION_PLACES) {
    throw new Error(`${MAX_MISSION_PLACES} lieux au plus pour une mission`);
  }
  const placeSlugs = Array.from(
    new Set(
      places
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => toPlaceSlug(entry))
        .filter(Boolean),
    ),
  );
  const tip =
    typeof raw.tip === "string"
      ? raw.tip.trim().slice(0, MAX_MISSION_TIP_LENGTH).trim()
      : "";
  return {
    placeSlugs: placeSlugs.length > 0 ? placeSlugs : undefined,
    tip: tip || undefined,
  };
}

/** N'écrit que `fields` : une correction publiée entre-temps sur l'autre survit. */
export async function updateMissionCommunity(
  id: string,
  values: MissionCommunity,
  fields: readonly string[],
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  const $unset: Record<string, ""> = {};
  for (const field of fields) {
    if (!(MISSION_FIELDS as readonly string[]).includes(field)) continue;
    // Un « avant » relu en base porte `null` pour un champ absent.
    const value = values[field as MissionField];
    if (
      value == null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      $unset[field] = "";
    } else {
      $set[field] = value;
    }
  }
  const { matchedCount } = await missions().updateOne(
    { _id: new ObjectId(id) },
    {
      $set,
      ...(Object.keys($unset).length > 0 ? { $unset } : {}),
    },
  );
  return matchedCount > 0;
}

/** Les missions qui se jouent dans un lieu, pour sa fiche. */
export async function listMissionsAt(
  placeSlug: string,
  limit = 12,
): Promise<{ id: string; title: string }[]> {
  const docs = await missions()
    .find(
      { placeSlugs: placeSlug, removedInVersion: { $exists: false } },
      { projection: { title: 1 } },
    )
    .sort({ title: 1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => ({ id: String(doc._id), title: doc.title }));
}

/**
 * L'étape `$lookup` qui joint ses blueprints à une mission (`blueprintDetails`).
 * Pour un joueur connecté, chacun porte `owned` : possédé, ou débloqué par
 * défaut pour tout le monde. Sans `userId`, pas de `owned` du tout, pour ne
 * pas afficher « Non possédé » à qui ne s'est pas connecté.
 */
export function missionBlueprintsLookup(userId?: string) {
  const ownership = userId
    ? [
        {
          $lookup: {
            from: "user-blueprints",
            let: { bpId: { $toString: "$_id" } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$blueprintId", "$$bpId"] },
                      { $eq: ["$userId", userId] },
                    ],
                  },
                },
              },
            ],
            as: "ownership",
          },
        },
        {
          $addFields: {
            owned: {
              $or: [
                { $eq: ["$isDefault", true] },
                { $gt: [{ $size: "$ownership" }, 0] },
              ],
            },
          },
        },
        { $project: { ownership: 0 } },
      ]
    : [];

  return {
    $lookup: {
      from: "blueprints",
      let: { blueprintIds: "$blueprints" },
      pipeline: [
        { $match: { $expr: { $in: ["$_id", "$$blueprintIds"] } } },
        ...ownership,
      ],
      as: "blueprintDetails",
    },
  };
}
