import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import en from "@/messages/en.json";
import {
  buildItemEdit,
  buildMissionEdit,
  buildPlaceCreate,
  buildPlaceEdit,
  type CatalogDraft,
} from "@/lib/contribution-catalog";
import { ContributionError } from "@/lib/contribution-store";
import {
  getStanding,
  listMyContributions,
  listMyOpenContributions,
  submitCatalogContribution,
  type CatalogSubmission,
} from "@/lib/contributions";
import { getNpsData, getPlaceBySlug } from "@/lib/places";
import { parseShowLocation, positionOf } from "@/lib/nps-geometry";
import {
  DIRECT_EDIT_LEVEL,
  type ContributionErrorCode,
} from "@/types/contributions";
import { PLACE_SERVICES, PLACE_TYPES } from "@/types/places";
import { currentUser, personalTool, type McpUser } from "../auth";
import {
  confirmParam,
  confirmWrite,
  writeOutput,
  type Confirmation,
} from "../confirm";
import { READ_ONLY, siteUrl, toolError, toolResult } from "../format";
import type { ServerContext } from "@modelcontextprotocol/server";

const CONTRIBUTIONS_PATH = "/contributions";

const standingChallenge = personalTool("my_contributor_standing", "profile");
const positionChallenge = personalTool(
  "contribute_place_position",
  "contributions:write",
);
const placeEditChallenge = personalTool(
  "contribute_place_edit",
  "contributions:write",
);
const placeCreateChallenge = personalTool(
  "contribute_place_create",
  "contributions:write",
);
const itemEditChallenge = personalTool(
  "contribute_item_edit",
  "contributions:write",
);
const missionChallenge = personalTool(
  "contribute_mission_tip",
  "contributions:write",
);

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const ERRORS = en.Contributions.errors as Record<ContributionErrorCode, string>;

/** Le message d'une erreur de contribution, en anglais, détail de validation compris. */
export function contributionErrorText(error: ContributionError): string {
  const message = ERRORS[error.code] ?? error.code;
  return error.detail && error.detail !== error.code
    ? `${message} (${error.detail})`
    : message;
}

const metaParams = {
  source: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Where the information comes from: a link, a patch note, 'seen in game'",
    ),
  gameVersion: z
    .string()
    .max(40)
    .optional()
    .describe("Game version it was seen in, e.g. 4.3.1"),
};

const contributionOutput = writeOutput({
  contributionId: z.string(),
  contributionStatus: z.string(),
  points: z.number(),
  url: z.string(),
});

function draftSummary(
  user: McpUser,
  draft: CatalogDraft,
  level: number,
): string {
  const changes = draft.changes
    .map(
      (change) =>
        `- ${change.field}: ${change.before ?? "(empty)"} → ${change.after ?? "(empty)"}`,
    )
    .join("\n");
  const how =
    level >= DIRECT_EDIT_LEVEL
      ? "It will be published right away (contributor level 3 or more), and can be reviewed later."
      : "It will be reviewed by the community before publication.";
  return `Propose, as ${user.name}, this change to “${draft.target.name ?? draft.target.slug}” (${draft.target.type}):\n${changes}\n${how}`;
}

/**
 * Le chemin commun des outils de contribution : construire la proposition
 * (ce qui la valide et donne l'avant/après), la faire confirmer, l'envoyer.
 */
async function contribute(
  ctx: ServerContext,
  build: (level: number) => Promise<CatalogDraft>,
  submission: CatalogSubmission,
  meta: { source?: string; gameVersion?: string },
  confirm: boolean | undefined,
  describe: (summary: string, draft: CatalogDraft) => string = (summary) =>
    summary,
) {
  const user = await currentUser(ctx);
  const author = { id: new ObjectId(user.id), name: user.name };
  try {
    const standing = await getStanding(author.id);
    if (standing.suspendedUntil) {
      return toolError(
        contributionErrorText(new ContributionError("suspended", 403)),
      );
    }
    const draft = await build(standing.level);
    let summary = describe(draftSummary(user, draft, standing.level), draft);
    // Une seule proposition ouverte par fiche et par auteur : l'envoi reprend
    // celle qui attend, et la remplace.
    const open = await listMyOpenContributions(author.id, {
      type: draft.target.type,
      slug: draft.target.slug,
    });
    const replaced = open.find((c) => c.kind === draft.kind);
    if (replaced) {
      summary += `\nThis replaces ${user.name}'s ${draft.kind} awaiting review on this entry (${(replaced.changes ?? []).map((c) => c.field).join(", ") || "same entry"}): send all the changes together.`;
    }
    const confirmation: Confirmation = confirmWrite(ctx, summary, confirm);
    if (!confirmation.confirmed) return confirmation.result;

    const { contribution, standing: after } = await submitCatalogContribution(
      author,
      submission,
      meta,
    );
    const published = contribution.status === "published";
    return toolResult(
      {
        status: "done",
        summary,
        contributionId: contribution.id,
        contributionStatus: contribution.status,
        points: contribution.points,
        url: siteUrl(CONTRIBUTIONS_PATH),
      },
      published
        ? `Published. ${contribution.points} contribution points; ${user.name} now has ${after.points}.`
        : `Sent for review (contribution ${contribution.id}); it earns ${contribution.points} points once published. ${after.pending} contributions are awaiting review.`,
    );
  } catch (error) {
    if (error instanceof ContributionError) {
      return toolError(`Not sent: ${contributionErrorText(error)}`);
    }
    throw error;
  }
}

export function registerContributionTools(server: McpServer) {
  server.registerTool(
    "my_contributor_standing",
    {
      title: "My contributor standing",
      description:
        "The signed-in player's community contributor standing (points, level, acceptance rate, what is awaiting review) and their latest contributions with their status.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
      outputSchema: z.object({
        points: z.number(),
        level: z.number(),
        levelKey: z.string(),
        nextLevelPoints: z.number().optional(),
        acceptanceRate: z.number().optional(),
        pending: z.number(),
        directPublication: z.boolean(),
        suspendedUntil: z.string().optional(),
        contributions: z.array(
          z.object({
            id: z.string(),
            kind: z.string(),
            target: z.string(),
            status: z.string(),
            points: z.number(),
            createdAt: z.string(),
            reviewMessage: z.string().optional(),
          }),
        ),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: standingChallenge,
    },
    async ({ limit = 10 }, ctx) => {
      const user = await currentUser(ctx);
      const id = new ObjectId(user.id);
      const [standing, recent] = await Promise.all([
        getStanding(id),
        listMyContributions(id, limit),
      ]);
      const contributions = recent.map((c) => ({
        id: c.id,
        kind: c.kind,
        target: c.target.name ?? c.target.slug,
        status: c.status,
        points: c.points,
        createdAt: c.createdAt,
        reviewMessage: c.review?.message,
      }));
      const data = {
        ...standing,
        directPublication: standing.level >= DIRECT_EDIT_LEVEL,
        contributions,
        url: siteUrl(CONTRIBUTIONS_PATH),
      };
      return toolResult(
        data,
        `${user.name}: level ${standing.level} (${standing.levelKey}), ${standing.points} points` +
          (standing.nextLevelPoints
            ? `, next level at ${standing.nextLevelPoints}`
            : "") +
          `. ${standing.pending} awaiting review.` +
          (standing.suspendedUntil
            ? ` Contributions suspended until ${standing.suspendedUntil}.`
            : "") +
          "\n\nLatest contributions:\n" +
          (contributions
            .map(
              (c) =>
                `- ${c.kind} on ${c.target}: ${c.status} (${c.points} pts)${c.reviewMessage ? ` — reviewer: “${c.reviewMessage}”` : ""}`,
            )
            .join("\n") || "none yet"),
      );
    },
  );

  server.registerTool(
    "contribute_place_position",
    {
      title: "Contribute a place's NPS position",
      description:
        "Propose the NPS coordinates of a place from a /showlocation reading taken there (in game, standing at the place). The reading is converted to the frame of the body the player is on. Asks the user to confirm first.",
      inputSchema: z.object({
        place: z.string().describe("Slug of the place"),
        location: z
          .string()
          .describe(
            "The /showlocation line taken at the place: Coordinates: x:… y:… z:…",
          ),
        gameVersion: metaParams.gameVersion,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: positionChallenge,
    },
    async ({ place, location, gameVersion, confirm }, ctx) => {
      const coordinates = parseShowLocation(location);
      if (!coordinates) {
        return toolError(
          'Could not read coordinates. Expected the /showlocation line: "Coordinates: x:… y:… z:…".',
        );
      }
      const { bodies } = await getNpsData();
      const position = positionOf({ ...coordinates, at: Date.now() }, bodies);
      const body = position.body
        ? bodies.find((b) => b.slug === position.body)
        : undefined;
      return contribute(
        ctx,
        (level) => buildPlaceEdit(place, { position }, level),
        { kind: "placeEdit", slug: place, input: { position } },
        { source: "/showlocation", gameVersion },
        confirm,
        (summary) =>
          `${summary}\nReading taken ${body ? `on ${body.name}` : "in space"}.`,
      );
    },
  );

  server.registerTool(
    "contribute_place_edit",
    {
      title: "Contribute a correction to a place",
      description:
        "Propose changes to a place of the catalog (get_place shows the current entry): description, type, services, player tip, shop category and sold items. Only the fields given change. Asks the user to confirm first.",
      inputSchema: z.object({
        place: z.string().describe("Slug of the place"),
        changes: z.object({
          description: z.string().max(5000).optional(),
          type: z.enum(PLACE_TYPES).optional(),
          services: z.array(z.enum(PLACE_SERVICES)).optional(),
          tip: z
            .string()
            .max(1000)
            .optional()
            .describe("Player tip: where to park, which elevator to take…"),
          shopCategory: z.string().max(80).optional(),
          soldItems: z
            .array(z.string())
            .optional()
            .describe("Item slugs a shop sells"),
        }),
        ...metaParams,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: placeEditChallenge,
    },
    async ({ place, changes, source, gameVersion, confirm }, ctx) =>
      contribute(
        ctx,
        (level) => buildPlaceEdit(place, changes, level),
        { kind: "placeEdit", slug: place, input: changes },
        { source, gameVersion },
        confirm,
      ),
  );

  server.registerTool(
    "contribute_place_create",
    {
      title: "Contribute a new place",
      description:
        "Propose a place missing from the catalog, under its parent (a system, planet, moon, city, station…). The slug follows the name. Asks the user to confirm first.",
      inputSchema: z.object({
        parent: z.string().describe("Slug of the parent place"),
        place: z.object({
          name: z.string().min(1).max(120),
          type: z.enum(PLACE_TYPES),
          description: z.string().max(5000).optional(),
          services: z.array(z.enum(PLACE_SERVICES)).optional(),
          tip: z.string().max(1000).optional(),
          shopCategory: z.string().max(80).optional(),
        }),
        ...metaParams,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: placeCreateChallenge,
    },
    async ({ parent, place, source, gameVersion, confirm }, ctx) => {
      if (!(await getPlaceBySlug(parent))) {
        return toolError(`Unknown parent place: ${parent}.`);
      }
      return contribute(
        ctx,
        () => buildPlaceCreate(parent, place),
        { kind: "placeCreate", parentSlug: parent, input: place },
        { source, gameVersion },
        confirm,
      );
    },
  );

  server.registerTool(
    "contribute_item_edit",
    {
      title: "Contribute a correction to an item",
      description:
        "Propose changes to an item of the catalog (get_item shows the current entry). `changes` holds only the fields to change, with the same shape as get_item: description, category, subcategory, manufacturer, size, tier, statistics, obtention, blueprintSlugs, variantGroup, variantName, setId, setName… Renaming needs contributor level 4. Asks the user to confirm first.",
      inputSchema: z.object({
        item: z.string().describe("Slug of the item"),
        changes: z.record(z.string(), z.unknown()),
        ...metaParams,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: itemEditChallenge,
    },
    async ({ item, changes, source, gameVersion, confirm }, ctx) =>
      contribute(
        ctx,
        (level) => buildItemEdit(item, changes, level),
        { kind: "itemEdit", slug: item, input: changes },
        { source, gameVersion },
        confirm,
      ),
  );

  server.registerTool(
    "contribute_mission_tip",
    {
      title: "Contribute to a mission",
      description:
        "Propose a player tip for a mission and/or the places where it takes place (mission ids appear in get_place). Asks the user to confirm first.",
      inputSchema: z.object({
        mission: z.string().describe("Mission id"),
        tip: z.string().max(2000).optional(),
        placeSlugs: z
          .array(z.string())
          .optional()
          .describe("All the places of the mission (replaces the list)"),
        ...metaParams,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: missionChallenge,
    },
    async ({ mission, tip, placeSlugs, source, gameVersion, confirm }, ctx) => {
      const input = {
        ...(tip !== undefined ? { tip } : {}),
        ...(placeSlugs !== undefined ? { placeSlugs } : {}),
      };
      if (Object.keys(input).length === 0) {
        return toolError("Give a tip, places, or both.");
      }
      return contribute(
        ctx,
        () => buildMissionEdit(mission, input),
        { kind: "missionEdit", missionId: mission, input },
        { source, gameVersion },
        confirm,
      );
    },
  );
}
