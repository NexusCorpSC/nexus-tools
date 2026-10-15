import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import db from "@/lib/db";
import { ACTIVE_MISSION } from "@/lib/data/missions";
import { missionBlueprintsLookup } from "@/lib/missions";
import { getPlacesBySlugs } from "@/lib/places";
import { getFactions, getPlayerReputations } from "@/lib/reputations";
import {
  careerFamily,
  currentLevel,
  factionFamily,
  fold,
  isMaxed,
  isStarted,
  matchesSearch,
  showsStanding,
} from "@/lib/reputations-view";
import type {
  Faction,
  FactionCareer,
  FactionLevel,
  PlayerReputations,
} from "@/types/reputations";
import { currentUser, optionalUserId, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import {
  mdLink,
  PAGE_SIZE,
  READ_ONLY,
  siteUrl,
  toolError,
  toolResult,
} from "../format";

/**
 * Les missions, leurs factions et les réputations du joueur : les mêmes
 * requêtes que les pages `/missions`, `/missions/[id]`,
 * `/missions/factions/[id]` et les routes `/api/missions`, et la même
 * configuration des réputations que `/reps` (`lib/reputations.ts`). Changer
 * une réputation suit exactement les contrôles de `PUT /api/reps`.
 *
 * Deux sortes de factions coexistent : celles des missions (collection
 * `factions`, un id) et celles des réputations (configuration, un nom). On les
 * rapproche par leur nom.
 */

const MISSIONS_PATH = "/missions";
const REPS_PATH = "/reps";
const missionPath = (id: string) => `/missions/${id}`;
const missionFactionPath = (id: string) => `/missions/factions/${id}`;
const blueprintPath = (slug: string) => `/crafting/blueprints/${slug}`;

const myRepsChallenge = personalTool("my_reputations", "reputation:read");
const updateRepChallenge = personalTool(
  "update_reputation",
  "reputation:write",
);

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const isObjectId = (value: string) =>
  ObjectId.isValid(value) && /^[0-9a-f]{24}$/i.test(value);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Schémas ──────────────────────────────────────────────────────────────────

const missionBlueprintSchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  owned: z.boolean().optional(),
  url: z.string(),
});

const missionFactionSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
});

const missionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string().optional(),
  missionType: z.string().optional(),
  faction: missionFactionSchema.optional(),
  rewardUEC: z.number().optional(),
  illegal: z.boolean(),
  canBeShared: z.boolean(),
  blueprints: z.array(missionBlueprintSchema),
  url: z.string(),
});

const levelSchema = z.object({
  name: z.string(),
  level: z.number(),
  isDefault: z.boolean(),
  minReputation: z.number().optional(),
});

const careerSchema = z.object({
  name: z.string(),
  family: z.string(),
  levels: z.array(levelSchema),
});

const factionSchema = z.object({
  name: z.string(),
  family: z.string(),
  description: z.string().optional(),
  lawful: z.boolean().optional(),
  focus: z.string().optional(),
  headquarters: z.string().optional(),
  removedInVersion: z.string().optional(),
  standings: z.array(z.string()),
  defaultStanding: z.string().optional(),
  careers: z.array(careerSchema),
});

// ─── Utilitaires ──────────────────────────────────────────────────────────────

type BlueprintDoc = {
  _id: ObjectId;
  name?: string;
  slug?: string;
  category?: string;
  subcategory?: string;
  owned?: boolean;
};

function toMissionBlueprint(
  bp: BlueprintDoc,
): z.infer<typeof missionBlueprintSchema> {
  const slug = String(bp.slug ?? "");
  return {
    slug,
    name: String(bp.name ?? slug),
    category: bp.category || undefined,
    subcategory: bp.subcategory || undefined,
    owned: typeof bp.owned === "boolean" ? bp.owned : undefined,
    url: siteUrl(blueprintPath(slug)),
  };
}

function toMissionFaction(
  faction: { _id: unknown; name?: string } | undefined | null,
): z.infer<typeof missionFactionSchema> | undefined {
  if (!faction?._id) return undefined;
  const id = String(faction._id);
  return {
    id,
    name: String(faction.name ?? ""),
    url: siteUrl(missionFactionPath(id)),
  };
}

function toLevel(level: FactionLevel): z.infer<typeof levelSchema> {
  return {
    name: level.name,
    level: level.level,
    isDefault: level.isDefault === true,
    minReputation: level.minReputation ?? undefined,
  };
}

function toFaction(faction: Faction): z.infer<typeof factionSchema> {
  return {
    name: faction.name,
    family: factionFamily(faction),
    description: faction.description || undefined,
    lawful: faction.lawful ?? undefined,
    focus: faction.focus || undefined,
    headquarters: faction.headquarters || undefined,
    removedInVersion: faction.removedInVersion || undefined,
    standings: showsStanding(faction) ? faction.standings : [],
    defaultStanding: showsStanding(faction)
      ? faction.defaultStanding || undefined
      : undefined,
    careers: faction.careers.map((career) => ({
      name: career.name,
      family: careerFamily(career),
      levels: career.levels.map(toLevel),
    })),
  };
}

/** La faction des réputations qu'un nom désigne : exact (casse et accents à part), sinon un seul nom qui le contient. */
function findRepFaction(
  factions: Faction[],
  name: string,
): { faction?: Faction; candidates: Faction[] } {
  const key = fold(name.trim());
  const exact = factions.find((faction) => fold(faction.name) === key);
  if (exact) return { faction: exact, candidates: [] };
  const partial = factions.filter((faction) =>
    fold(faction.name).includes(key),
  );
  return partial.length === 1
    ? { faction: partial[0], candidates: [] }
    : { candidates: partial };
}

type MissionFactionDoc = { _id: ObjectId; name: string };

/** La faction des missions qu'un id ou un nom désigne (exact, sinon un seul nom qui le contient). */
function findMissionFaction(
  factions: MissionFactionDoc[],
  value: string,
): { faction?: MissionFactionDoc; candidates: MissionFactionDoc[] } {
  const key = value.trim();
  if (isObjectId(key)) {
    const byId = factions.find((one) => String(one._id) === key);
    return { faction: byId, candidates: [] };
  }
  const exact = factions.find((one) => fold(one.name) === fold(key));
  if (exact) return { faction: exact, candidates: [] };
  const partial = factions.filter((one) => fold(one.name).includes(fold(key)));
  return partial.length === 1
    ? { faction: partial[0], candidates: [] }
    : { candidates: partial };
}

async function missionFactions(): Promise<MissionFactionDoc[]> {
  return db
    .db()
    .collection<MissionFactionDoc>("factions")
    .find({}, { projection: { _id: 1, name: 1 } })
    .toArray();
}

/** Missions actives et blueprints distincts de chaque faction, comme `/api/missions/factions`. */
async function missionFactionCounts(): Promise<
  { id: string; name: string; missionCount: number; blueprintCount: number }[]
> {
  const docs = await db
    .db()
    .collection("factions")
    .aggregate<{
      _id: ObjectId;
      name: string;
      missionCount: number;
      blueprintCount: number;
    }>([
      {
        $lookup: {
          from: "missions",
          localField: "_id",
          foreignField: "factionId",
          pipeline: [{ $match: ACTIVE_MISSION }],
          as: "missions",
        },
      },
      {
        $addFields: {
          missionCount: { $size: "$missions" },
          blueprintIds: {
            $reduce: {
              input: "$missions.blueprints",
              initialValue: [],
              in: { $setUnion: ["$$value", { $ifNull: ["$$this", []] }] },
            },
          },
        },
      },
      { $addFields: { blueprintCount: { $size: "$blueprintIds" } } },
      { $project: { _id: 1, name: 1, missionCount: 1, blueprintCount: 1 } },
      { $sort: { name: 1 } },
    ])
    .toArray();
  return docs.map((doc) => ({
    id: String(doc._id),
    name: String(doc.name ?? ""),
    missionCount: doc.missionCount,
    blueprintCount: doc.blueprintCount,
  }));
}

function refreshReps() {
  try {
    revalidatePath(REPS_PATH);
  } catch {
    // Hors d'une requête Next (tests) : rien à rafraîchir.
  }
}

function levelLabel(career: FactionCareer, level: FactionLevel | undefined) {
  if (!level) return "no rank";
  const index = career.levels.findIndex((one) => one.name === level.name);
  return `${level.name} (${index + 1}/${career.levels.length})`;
}

// ─── Outils ───────────────────────────────────────────────────────────────────

export function registerMissionTools(server: McpServer) {
  server.registerTool(
    "get_mission",
    {
      title: "Get a mission",
      description:
        "Get a Star Citizen mission (contract) by its id, as returned by search or search_missions: type, category, faction, description (it holds the objectives), aUEC reward, legality, whether it can be shared, the blueprints it rewards, where it is played and the community tip. When the user is signed in with crafting access, each blueprint says whether they own it.",
      inputSchema: z.object({
        missionId: z
          .string()
          .min(1)
          .describe("Mission id, from search or search_missions"),
      }),
      outputSchema: z.object({
        id: z.string(),
        title: z.string(),
        category: z.string().optional(),
        missionType: z.string().optional(),
        description: z.string().optional(),
        faction: missionFactionSchema.optional(),
        rewardUEC: z.number().optional(),
        illegal: z.boolean(),
        canBeShared: z.boolean(),
        blueprints: z.array(missionBlueprintSchema),
        places: z.array(
          z.object({
            slug: z.string(),
            name: z.string(),
            location: z.string().optional(),
            url: z.string(),
          }),
        ),
        tip: z.string().optional(),
        removedInVersion: z.string().optional(),
        replacedMissionId: z.string().optional(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ missionId }, ctx) => {
      const userId = optionalUserId(ctx, "crafting:read") ?? undefined;
      const load = async (id: string) => {
        if (!isObjectId(id)) return null;
        const [mission] = await db
          .db()
          .collection("missions")
          .aggregate([
            { $match: { _id: new ObjectId(id) } },
            {
              $lookup: {
                from: "factions",
                localField: "factionId",
                foreignField: "_id",
                as: "faction",
              },
            },
            {
              $unwind: { path: "$faction", preserveNullAndEmptyArrays: true },
            },
            missionBlueprintsLookup(userId),
          ])
          .toArray();
        return mission ?? null;
      };

      let mission = await load(missionId.trim());
      if (!mission) {
        return toolError(
          `No mission with id ${missionId}: find it with search_missions or search.`,
        );
      }
      // Fusionnée par la source dans une autre : la page suit, l'outil aussi.
      let replacedMissionId: string | undefined;
      if (mission.replacedBy) {
        const target = await load(String(mission.replacedBy));
        if (target) {
          replacedMissionId = String(mission._id);
          mission = target;
        }
      }

      const id = String(mission._id);
      const places = (
        await getPlacesBySlugs(mission.placeSlugs as string[] | undefined)
      ).map((place) => {
        const trail = [
          ...new Set(
            [place.systemName, place.bodyName, place.parentName].filter(
              (name): name is string => !!name,
            ),
          ),
        ].join(" › ");
        return {
          slug: place.slug,
          name: place.name,
          location: trail || undefined,
          url: siteUrl(`/lieux/${place.slug}`),
        };
      });
      const blueprints = (
        (mission.blueprintDetails ?? []) as BlueprintDoc[]
      ).map(toMissionBlueprint);
      const faction = toMissionFaction(mission.faction);
      const structured = {
        id,
        title: String(mission.title ?? ""),
        category: mission.category || undefined,
        missionType: mission.missionType || undefined,
        description: mission.description || undefined,
        faction,
        rewardUEC:
          typeof mission.rewardUEC === "number" ? mission.rewardUEC : undefined,
        illegal: mission.illegal === true,
        canBeShared: mission.canBeShared === true,
        blueprints,
        places,
        tip: mission.tip || undefined,
        removedInVersion: mission.removedInVersion || undefined,
        replacedMissionId,
        url: siteUrl(missionPath(id)),
      };

      const lines = [
        `# ${mdLink(structured.title, missionPath(id))}`,
        [structured.missionType, structured.category]
          .filter(Boolean)
          .join(" · "),
        replacedMissionId
          ? `(Mission ${replacedMissionId} was merged into this one.)`
          : "",
        structured.removedInVersion
          ? `No longer offered in game since ${structured.removedInVersion}.`
          : "",
        faction
          ? `Faction: ${mdLink(faction.name, missionFactionPath(faction.id))} (faction id: ${faction.id})`
          : "",
        structured.rewardUEC
          ? `Reward: ${structured.rewardUEC.toLocaleString("en-US")} aUEC`
          : "",
        `${structured.illegal ? "Illegal" : "Legal"}; ${structured.canBeShared ? "can be shared" : "cannot be shared"}`,
        structured.description ? `\n${structured.description}\n` : "",
        blueprints.length
          ? "Blueprints rewarded:\n" +
            blueprints
              .map(
                (bp) =>
                  `- ${mdLink(bp.name, blueprintPath(bp.slug))} (slug: ${bp.slug})` +
                  (bp.owned === undefined
                    ? ""
                    : bp.owned
                      ? " — owned"
                      : " — not owned"),
              )
              .join("\n")
          : "No blueprint reward.",
        places.length
          ? "Played at:\n" +
            places
              .map(
                (place) =>
                  `- ${mdLink(place.name, `/lieux/${place.slug}`)}${place.location ? ` (${place.location})` : ""}`,
              )
              .join("\n")
          : "No place known yet (the community can add them with contribute_mission_tip).",
        structured.tip ? `Community tip: ${structured.tip}` : "",
      ].filter(Boolean);

      return toolResult(structured, lines.join("\n"));
    },
  );

  server.registerTool(
    "search_missions",
    {
      title: "Search missions",
      description:
        "Search the missions still offered in game, as the /missions page filters them: by words of the title or description, by faction (id from search, list_factions or get_mission, or the faction's name) and/or only missions that reward blueprints. Sorted by title, paginated. Mission ids work with get_mission.",
      inputSchema: z.object({
        query: z
          .string()
          .max(100)
          .optional()
          .describe("Words of the title or description"),
        faction: z.string().optional().describe("Mission faction id or name"),
        hasBlueprints: z
          .boolean()
          .optional()
          .describe("Only missions that reward at least one blueprint"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(PAGE_SIZE.max)
          .optional()
          .describe(`Results per page (default ${PAGE_SIZE.default})`),
        page: z.number().int().min(1).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        page: z.number(),
        totalPages: z.number(),
        missions: z.array(missionSummarySchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({
      query,
      faction,
      hasBlueprints,
      limit = PAGE_SIZE.default,
      page = 1,
    }) => {
      const match: Record<string, unknown> = { ...ACTIVE_MISSION };
      const words = query?.trim();
      if (words) {
        const pattern = { $regex: escapeRegex(words), $options: "i" };
        match.$or = [{ title: pattern }, { description: pattern }];
      }
      let factionName: string | undefined;
      if (faction !== undefined) {
        const found = findMissionFaction(await missionFactions(), faction);
        if (!found.faction) {
          return toolError(
            found.candidates.length
              ? `Several mission factions match “${faction}”: ${found.candidates.map((one) => `${one.name} (id ${one._id})`).join(", ")}.`
              : `No mission faction “${faction}”: see list_factions.`,
          );
        }
        match.factionId = found.faction._id;
        factionName = found.faction.name;
      }
      if (hasBlueprints) {
        match.blueprints = { $exists: true, $not: { $size: 0 } };
      }

      const collection = db.db().collection("missions");
      const [total, docs] = await Promise.all([
        collection.countDocuments(match),
        collection
          .aggregate([
            { $match: match },
            { $sort: { title: 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: "factions",
                localField: "factionId",
                foreignField: "_id",
                as: "faction",
                pipeline: [{ $project: { _id: 1, name: 1 } }],
              },
            },
            {
              $unwind: { path: "$faction", preserveNullAndEmptyArrays: true },
            },
            {
              $lookup: {
                from: "blueprints",
                localField: "blueprints",
                foreignField: "_id",
                as: "blueprintDetails",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      slug: 1,
                      category: 1,
                      subcategory: 1,
                    },
                  },
                ],
              },
            },
            {
              $project: {
                _id: 1,
                title: 1,
                category: 1,
                missionType: 1,
                illegal: 1,
                canBeShared: 1,
                rewardUEC: 1,
                faction: 1,
                blueprintDetails: 1,
              },
            },
          ])
          .toArray(),
      ]);

      const missions = docs.map((doc) => {
        const id = String(doc._id);
        return {
          id,
          title: String(doc.title ?? ""),
          category: doc.category || undefined,
          missionType: doc.missionType || undefined,
          faction: toMissionFaction(doc.faction),
          rewardUEC:
            typeof doc.rewardUEC === "number" ? doc.rewardUEC : undefined,
          illegal: doc.illegal === true,
          canBeShared: doc.canBeShared === true,
          blueprints: ((doc.blueprintDetails ?? []) as BlueprintDoc[]).map(
            toMissionBlueprint,
          ),
          url: siteUrl(missionPath(id)),
        };
      });
      const totalPages = Math.ceil(total / limit);

      const filters = [
        words ? `“${words}”` : undefined,
        factionName ? `faction ${factionName}` : undefined,
        hasBlueprints ? "with blueprints" : undefined,
      ].filter(Boolean);
      const text = missions.length
        ? `${total} missions${filters.length ? ` (${filters.join(", ")})` : ""}` +
          (totalPages > 1 ? `, page ${page}/${totalPages}` : "") +
          ":\n" +
          missions
            .map(
              (mission) =>
                `- ${mdLink(mission.title, missionPath(mission.id))} (id: ${mission.id})` +
                (mission.faction ? ` — ${mission.faction.name}` : "") +
                (mission.rewardUEC
                  ? ` — ${mission.rewardUEC.toLocaleString("en-US")} aUEC`
                  : "") +
                (mission.illegal ? " — illegal" : "") +
                (mission.blueprints.length
                  ? ` — blueprints: ${mission.blueprints.map((bp) => bp.name).join(", ")}`
                  : ""),
            )
            .join("\n")
        : total > 0
          ? `No mission on page ${page}: there are ${totalPages} pages.`
          : `No mission found${filters.length ? ` (${filters.join(", ")})` : ""}.`;

      return toolResult(
        { total, page, totalPages, missions, url: siteUrl(MISSIONS_PATH) },
        text,
      );
    },
  );

  server.registerTool(
    "list_factions",
    {
      title: "List factions",
      description:
        "List Star Citizen factions: the reputation factions of the /reps page with their careers and the names of each career's ranks, and the mission factions of /missions/factions with their number of missions and blueprints (both kinds are matched by name). Optionally filter by words of a faction, career or rank name. Use get_faction for the full rank ladders and the faction's missions.",
      inputSchema: z.object({
        query: z
          .string()
          .max(100)
          .optional()
          .describe("Words of a faction, career or rank name"),
      }),
      outputSchema: z.object({
        total: z.number(),
        factions: z.array(
          z.object({
            name: z.string(),
            family: z.string().optional(),
            removedInVersion: z.string().optional(),
            careers: z.array(
              z.object({ name: z.string(), ranks: z.array(z.string()) }),
            ),
            missionFactionId: z.string().optional(),
            missionCount: z.number().optional(),
            blueprintCount: z.number().optional(),
            url: z.string(),
          }),
        ),
      }),
      annotations: READ_ONLY,
    },
    async ({ query }) => {
      const needle = fold(query?.trim() ?? "");
      const [repFactions, counts] = await Promise.all([
        getFactions(),
        missionFactionCounts(),
      ]);
      const countsByName = new Map(counts.map((one) => [fold(one.name), one]));
      const repNames = new Set(
        repFactions.map((faction) => fold(faction.name)),
      );

      const factions = repFactions
        .filter((faction) => !faction.removedInVersion)
        .filter((faction) => matchesSearch(faction, needle))
        .map((faction) => {
          const missions = countsByName.get(fold(faction.name));
          return {
            name: faction.name,
            family: factionFamily(faction) as string | undefined,
            removedInVersion: undefined as string | undefined,
            careers: faction.careers.map((career) => ({
              name: career.name,
              ranks: career.levels.map((level) => level.name),
            })),
            missionFactionId: missions?.id,
            missionCount: missions?.missionCount,
            blueprintCount: missions?.blueprintCount,
            url: siteUrl(
              missions ? missionFactionPath(missions.id) : REPS_PATH,
            ),
          };
        });
      // Les factions des missions sans réputation suivie sur /reps.
      for (const one of counts) {
        if (one.missionCount === 0 || repNames.has(fold(one.name))) continue;
        if (needle && !fold(one.name).includes(needle)) continue;
        factions.push({
          name: one.name,
          family: undefined,
          removedInVersion: undefined,
          careers: [],
          missionFactionId: one.id,
          missionCount: one.missionCount,
          blueprintCount: one.blueprintCount,
          url: siteUrl(missionFactionPath(one.id)),
        });
      }
      factions.sort((a, b) => a.name.localeCompare(b.name));

      const text = factions.length
        ? `${factions.length} factions (see ${mdLink("reputations", REPS_PATH)} and ${mdLink("mission factions", "/missions/factions")}):\n` +
          factions
            .map(
              (faction) =>
                `- ${mdLink(faction.name, new URL(faction.url).pathname)}` +
                (faction.missionFactionId
                  ? ` (faction id: ${faction.missionFactionId}; ${faction.missionCount} missions, ${faction.blueprintCount} blueprints)`
                  : "") +
                (faction.careers.length
                  ? "\n" +
                    faction.careers
                      .map(
                        (career) =>
                          `  - ${career.name}: ${career.ranks.join(" → ")}`,
                      )
                      .join("\n")
                  : ""),
            )
            .join("\n")
        : `No faction matches “${query}”.`;

      return toolResult({ total: factions.length, factions }, text);
    },
  );

  server.registerTool(
    "get_faction",
    {
      title: "Get a faction",
      description:
        "Get a Star Citizen faction by name (or mission faction id from search, list_factions or get_mission): its description, standings, careers with every rank (relative level, reputation needed), and its missions still offered in game with the blueprints they reward.",
      inputSchema: z.object({
        faction: z
          .string()
          .min(1)
          .describe("Faction name, or mission faction id"),
      }),
      outputSchema: z.object({
        name: z.string(),
        reputation: factionSchema.optional(),
        missionFaction: missionFactionSchema.optional(),
        missionCount: z.number(),
        missions: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            missionType: z.string().optional(),
            rewardUEC: z.number().optional(),
            blueprintCount: z.number(),
            url: z.string(),
          }),
        ),
        blueprints: z.array(missionBlueprintSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ faction: value }) => {
      const key = value.trim();
      const [repFactions, allMissionFactions] = await Promise.all([
        getFactions(),
        missionFactions(),
      ]);

      let missionFaction: MissionFactionDoc | undefined;
      let repFaction: Faction | undefined;
      if (isObjectId(key)) {
        missionFaction = allMissionFactions.find(
          (one) => String(one._id) === key,
        );
        if (!missionFaction) {
          return toolError(`No mission faction with id ${value}.`);
        }
        repFaction = repFactions.find(
          (faction) => fold(faction.name) === fold(missionFaction!.name),
        );
      } else {
        const found = findRepFaction(repFactions, key);
        repFaction = found.faction;
        // Une faction des réputations trouvée : sa faction des missions porte
        // exactement son nom. Sinon, le nom donné cherche parmi les missions.
        const byMissions = repFaction
          ? {
              faction: allMissionFactions.find(
                (one) => fold(one.name) === fold(repFaction!.name),
              ),
              candidates: [],
            }
          : findMissionFaction(allMissionFactions, key);
        missionFaction = byMissions.faction;
        if (!repFaction && !missionFaction) {
          const names = [
            ...found.candidates.map((faction) => faction.name),
            ...byMissions.candidates.map((one) => one.name),
          ];
          return toolError(
            names.length
              ? `Several factions match “${value}”: ${[...new Set(names)].join(", ")}.`
              : `No faction “${value}”: see list_factions.`,
          );
        }
      }

      // Ses missions encore en jeu et leurs blueprints, comme sa page.
      let missions: {
        id: string;
        title: string;
        missionType?: string;
        rewardUEC?: number;
        blueprintCount: number;
        url: string;
      }[] = [];
      let blueprints: z.infer<typeof missionBlueprintSchema>[] = [];
      if (missionFaction) {
        const docs = await db
          .db()
          .collection("missions")
          .find(
            { factionId: missionFaction._id, ...ACTIVE_MISSION },
            {
              projection: {
                title: 1,
                missionType: 1,
                rewardUEC: 1,
                blueprints: 1,
              },
            },
          )
          .sort({ title: 1 })
          .toArray();
        missions = docs.map((doc) => {
          const id = String(doc._id);
          return {
            id,
            title: String(doc.title ?? ""),
            missionType: doc.missionType || undefined,
            rewardUEC:
              typeof doc.rewardUEC === "number" ? doc.rewardUEC : undefined,
            blueprintCount: Array.isArray(doc.blueprints)
              ? doc.blueprints.length
              : 0,
            url: siteUrl(missionPath(id)),
          };
        });
        const ids = [
          ...new Map(
            docs
              .flatMap((doc) =>
                Array.isArray(doc.blueprints)
                  ? (doc.blueprints as ObjectId[])
                  : [],
              )
              .map((id) => [String(id), id]),
          ).values(),
        ];
        if (ids.length) {
          const bps = await db
            .db()
            .collection<BlueprintDoc>("blueprints")
            .find(
              { _id: { $in: ids } },
              { projection: { name: 1, slug: 1, category: 1, subcategory: 1 } },
            )
            .sort({ name: 1 })
            .toArray();
          blueprints = bps.map(toMissionBlueprint);
        }
      }

      const name = repFaction?.name ?? missionFaction!.name;
      const reputation = repFaction ? toFaction(repFaction) : undefined;
      const shownFaction = missionFaction
        ? toMissionFaction(missionFaction)
        : undefined;
      const MAX_MISSIONS = 50;
      const page = shownFaction
        ? missionFactionPath(shownFaction.id)
        : REPS_PATH;

      const lines = [`# ${mdLink(name, page)}`];
      if (reputation) {
        if (reputation.description) lines.push(reputation.description);
        const facts = [
          reputation.lawful === undefined
            ? undefined
            : reputation.lawful
              ? "lawful"
              : "unlawful",
          reputation.focus ? `focus: ${reputation.focus}` : undefined,
          reputation.headquarters
            ? `headquarters: ${reputation.headquarters}`
            : undefined,
          reputation.removedInVersion
            ? `removed from the game in ${reputation.removedInVersion}`
            : undefined,
        ].filter(Boolean);
        if (facts.length) lines.push(facts.join("; "));
        if (reputation.standings.length) {
          lines.push(
            `Standings: ${reputation.standings.join(", ")} (default ${reputation.defaultStanding ?? "none"})`,
          );
        }
        for (const career of reputation.careers) {
          lines.push(
            `Career ${career.name}:\n` +
              career.levels
                .map(
                  (level, index) =>
                    `  ${index + 1}. ${level.name}` +
                    (level.minReputation !== undefined
                      ? ` (${level.minReputation} rep)`
                      : "") +
                    (level.isDefault ? " — starting rank" : ""),
                )
                .join("\n"),
          );
        }
      } else {
        lines.push("No reputation is tracked for this faction on /reps.");
      }
      if (missionFaction) {
        lines.push(
          missions.length
            ? `${missions.length} missions (faction id: ${shownFaction!.id}):\n` +
                missions
                  .slice(0, MAX_MISSIONS)
                  .map(
                    (mission) =>
                      `- ${mdLink(mission.title, missionPath(mission.id))} (id: ${mission.id})` +
                      (mission.rewardUEC
                        ? ` — ${mission.rewardUEC.toLocaleString("en-US")} aUEC`
                        : ""),
                  )
                  .join("\n") +
                (missions.length > MAX_MISSIONS
                  ? `\n… and ${missions.length - MAX_MISSIONS} more (search_missions with this faction).`
                  : "")
            : "No mission offered in game right now.",
        );
        if (blueprints.length) {
          lines.push(
            "Blueprints from its missions:\n" +
              blueprints
                .map(
                  (bp) =>
                    `- ${mdLink(bp.name, blueprintPath(bp.slug))} (slug: ${bp.slug})`,
                )
                .join("\n"),
          );
        }
      }

      return toolResult(
        {
          name,
          reputation,
          missionFaction: shownFaction,
          missionCount: missions.length,
          missions: missions.slice(0, MAX_MISSIONS),
          blueprints,
          url: siteUrl(page),
        },
        lines.join("\n"),
      );
    },
  );

  server.registerTool(
    "my_reputations",
    {
      title: "My faction reputations",
      description:
        "List the signed-in player's reputations as the /reps page shows them: for each faction, the standing (when it has one) and the current rank of each career, with whether the faction is started or maxed. Filter by words of a faction, career or rank name, or keep only started factions.",
      inputSchema: z.object({
        query: z
          .string()
          .max(100)
          .optional()
          .describe("Words of a faction, career or rank name"),
        startedOnly: z
          .boolean()
          .optional()
          .describe(
            "Only factions where the player has moved past the starting rank or standing",
          ),
      }),
      outputSchema: z.object({
        total: z.number(),
        factions: z.array(
          z.object({
            name: z.string(),
            family: z.string(),
            standing: z.string().optional(),
            started: z.boolean(),
            maxed: z.boolean(),
            careers: z.array(
              z.object({
                name: z.string(),
                rank: z.string().optional(),
                rankNumber: z.number().optional(),
                rankCount: z.number(),
                isStartingRank: z.boolean(),
              }),
            ),
          }),
        ),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: myRepsChallenge,
    },
    async ({ query, startedOnly }, ctx) => {
      const user = await currentUser(ctx);
      const [factions, reputations] = await Promise.all([
        getFactions(),
        getPlayerReputations(user.id) as Promise<PlayerReputations>,
      ]);
      const needle = fold(query?.trim() ?? "");

      const listed = factions
        // Comme /reps : une faction disparue reste pour qui l'a commencée.
        .filter(
          (faction) =>
            !faction.removedInVersion || isStarted(faction, reputations),
        )
        .filter((faction) => matchesSearch(faction, needle))
        .filter((faction) => !startedOnly || isStarted(faction, reputations))
        .map((faction) => ({
          name: faction.name,
          family: factionFamily(faction) as string,
          standing: showsStanding(faction)
            ? reputations[faction.name]?.standing || faction.defaultStanding
            : undefined,
          started: isStarted(faction, reputations),
          maxed: isMaxed(faction, reputations),
          careers: faction.careers.map((career) => {
            const level = currentLevel(faction, career, reputations);
            const index = level
              ? career.levels.findIndex((one) => one.name === level.name)
              : -1;
            return {
              name: career.name,
              rank: level?.name,
              rankNumber: index >= 0 ? index + 1 : undefined,
              rankCount: career.levels.length,
              isStartingRank: level ? level.isDefault === true : true,
            };
          }),
        }));

      const text = listed.length
        ? `${user.name}'s reputations (${mdLink("reputations", REPS_PATH)}):\n` +
          listed
            .map(
              (faction) =>
                `- ${faction.name}` +
                (faction.maxed
                  ? " (maxed)"
                  : faction.started
                    ? ""
                    : " (not started)") +
                (faction.standing ? ` — standing ${faction.standing}` : "") +
                (faction.careers.length
                  ? ": " +
                    faction.careers
                      .map(
                        (career) =>
                          `${career.name} ${career.rank ?? "no rank"}` +
                          (career.rankNumber
                            ? ` (${career.rankNumber}/${career.rankCount})`
                            : ""),
                      )
                      .join("; ")
                  : ""),
            )
            .join("\n")
        : `No faction${startedOnly ? " started" : ""}${needle ? ` matching “${query}”` : ""} in ${mdLink("your reputations", REPS_PATH)}.`;

      return toolResult(
        { total: listed.length, factions: listed, url: siteUrl(REPS_PATH) },
        text,
      );
    },
  );

  server.registerTool(
    "update_reputation",
    {
      title: "Update a faction reputation",
      description:
        "Change the signed-in player's reputation with a faction, as on the /reps page: its standing, and/or the current rank of one career (career may be left out when the faction has a single career). Names come from list_factions, get_faction or my_reputations. Asks the user to confirm first.",
      inputSchema: z.object({
        faction: z.string().min(1).describe("Faction name"),
        standing: z
          .string()
          .optional()
          .describe("New standing, one of the faction's standings"),
        career: z.string().optional().describe("Career whose rank changes"),
        rank: z
          .string()
          .optional()
          .describe("New rank of that career, one of its rank names"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        faction: z.string(),
        standing: z.string().optional(),
        career: z.string().optional(),
        rank: z.string().optional(),
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: updateRepChallenge,
    },
    async (
      { faction: value, standing, career: careerValue, rank, confirm },
      ctx,
    ) => {
      const user = await currentUser(ctx);
      const factions = await getFactions();
      const found = findRepFaction(factions, value);
      const faction = found.faction;
      if (!faction) {
        return toolError(
          found.candidates.length
            ? `Several factions match “${value}”: ${found.candidates.map((one) => one.name).join(", ")}.`
            : `No reputation faction “${value}”: see list_factions.`,
        );
      }
      if (
        standing === undefined &&
        careerValue === undefined &&
        rank === undefined
      ) {
        return toolError(
          "Nothing to update: give standing and/or rank (with career).",
        );
      }

      const reputations = (await getPlayerReputations(
        user.id,
      )) as PlayerReputations;
      const update: Record<string, unknown> = {};
      const changes: string[] = [];

      // Mêmes contrôles que PUT /api/reps, les noms retrouvés sans tenir compte de la casse.
      let newStanding: string | undefined;
      if (standing !== undefined) {
        newStanding = faction.standings?.find(
          (one) => fold(one) === fold(standing),
        );
        if (!newStanding) {
          return toolError(
            faction.standings?.length
              ? `Invalid standing “${standing}” for ${faction.name}: ${faction.standings.join(", ")}.`
              : `${faction.name} has no standing to set.`,
          );
        }
        const before =
          reputations[faction.name]?.standing || faction.defaultStanding;
        if (before !== newStanding) {
          update[`reputations.${faction.name}.standing`] = newStanding;
          changes.push(`standing ${before ?? "none"} → ${newStanding}`);
        }
      }

      let career: FactionCareer | undefined;
      let level: FactionLevel | undefined;
      if (careerValue !== undefined || rank !== undefined) {
        if (rank === undefined) {
          return toolError("Give the new rank of the career.");
        }
        if (careerValue === undefined) {
          if (faction.careers.length !== 1) {
            return toolError(
              `${faction.name} has several careers: say which one (${faction.careers.map((one) => one.name).join(", ")}).`,
            );
          }
          career = faction.careers[0];
        } else {
          career = faction.careers.find(
            (one) => fold(one.name) === fold(careerValue),
          );
        }
        if (!career) {
          return toolError(
            `Invalid career “${careerValue}” for ${faction.name}: ${faction.careers.map((one) => one.name).join(", ") || "none"}.`,
          );
        }
        const chosen = career;
        level = chosen.levels.find((one) => fold(one.name) === fold(rank));
        if (!level) {
          return toolError(
            `Invalid rank “${rank}” for ${faction.name} — ${chosen.name}: ${chosen.levels.map((one) => one.name).join(", ")}.`,
          );
        }
        const before = currentLevel(faction, chosen, reputations);
        if (before?.name !== level.name) {
          update[`reputations.${faction.name}.careers.${chosen.name}.level`] =
            level;
          changes.push(
            `${chosen.name} ${levelLabel(chosen, before)} → ${levelLabel(chosen, level)}`,
          );
        }
      }

      if (Object.keys(update).length === 0) {
        return toolError(
          `Nothing to change: ${user.name}'s reputation with ${faction.name} is already that.`,
        );
      }

      const summary = `Update ${user.name}'s reputation with ${faction.name}: ${changes.join("; ")}.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      await db
        .db()
        .collection("users")
        .updateOne({ _id: new ObjectId(user.id) }, { $set: update });
      refreshReps();

      return toolResult(
        {
          status: "done",
          summary,
          faction: faction.name,
          standing: newStanding,
          career: career?.name,
          rank: level?.name,
          url: siteUrl(REPS_PATH),
        },
        `Done: ${summary} See ${mdLink("your reputations", REPS_PATH)}.`,
      );
    },
  );
}
