import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import en from "@/messages/en.json";
import {
  buildItemCreate,
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
import { getConfirmState, submitConfirmation } from "@/lib/confirmations";
import { getBlueprintBySlug } from "@/lib/crafting";
import { getItemBySlug } from "@/lib/items";
import { getNpsData, getPlaceBySlug } from "@/lib/places";
import { parseShowLocation, positionOf } from "@/lib/nps-geometry";
import {
  CHANGES_REQUESTED_TTL_DAYS,
  CONFIRM_DAILY_CAP,
  CONFIRM_SUBJECTS,
  CONTRIBUTION_STATUSES,
  DIRECT_EDIT_LEVEL,
  MAX_CONFIRM_COMMENT_LENGTH,
  OUTDATED_VOTES,
  POINTS,
  type Contribution,
  type ContributionErrorCode,
  type ConfirmSubject,
  type RejectReason,
} from "@/types/contributions";
import { ITEM_KINDS } from "@/types/items";
import { PLACE_SERVICES, PLACE_TYPES } from "@/types/places";
import { resumeHref, targetHref } from "@/app/contributions/links";
import { currentUser, personalTool, type McpUser } from "../auth";
import {
  confirmParam,
  confirmWrite,
  writeOutput,
  type Confirmation,
} from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";
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
const itemCreateChallenge = personalTool(
  "contribute_item_create",
  "contributions:write",
);
const confirmChallenge = personalTool("confirm_data", "contributions:write");
// Lire ses contributions, c'est lire son profil de contributeur, comme
// `my_contributor_standing` et `/api/me/contributions`.
const mineChallenge = personalTool("list_my_contributions", "profile");

export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const ERRORS = en.Contributions.errors as Record<ContributionErrorCode, string>;
const REASONS = en.Contributions.reasons as Record<RejectReason, string>;
const STATUS_LABELS = en.Contributions.Mine.statuses as Record<
  Contribution["status"],
  string
>;
const KIND_LABELS = en.Contributions.Mine.kinds as Record<
  Contribution["kind"],
  string
>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Le message d'une erreur de contribution, en anglais, détail de validation compris. */
export function contributionErrorText(error: ContributionError): string {
  const message = ERRORS[error.code] ?? error.code;
  return error.detail && error.detail !== error.code
    ? `${message} (${error.detail})`
    : message;
}

export const metaParams = {
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

export const contributionOutput = writeOutput({
  contributionId: z.string(),
  contributionStatus: z.string(),
  points: z.number(),
  url: z.string(),
});

/** Le nom en clair d'un type de fiche, quand son identifiant ne parle pas. */
const TARGET_LABELS: Record<string, string> = {
  timelineEvent: "official event",
};

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
    level >= DIRECT_EDIT_LEVEL && !draft.reviewRequired
      ? "It will be published right away (contributor level 3 or more), and can be reviewed later."
      : "It will be reviewed by the community before publication.";
  const name = draft.target.name ?? draft.target.slug;
  const type = TARGET_LABELS[draft.target.type] ?? draft.target.type;
  const what =
    draft.kind === "itemCreate" ||
    draft.kind === "placeCreate" ||
    draft.kind === "timelineCreate"
      ? `the new ${type} “${name}”${draft.target.parent ? ` under ${draft.target.parent.name}` : ""}`
      : `this change to “${name}” (${type})`;
  return `Propose, as ${user.name}, ${what}:\n${changes}\n${how}`;
}

/**
 * Le chemin commun des outils de contribution : construire la proposition
 * (ce qui la valide et donne l'avant/après), la faire confirmer, l'envoyer.
 */
export async function contribute(
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
    if (replaced && draft.kind === "timelineEdit") {
      // Une correction d'évènement complète celle qui attend (la fusion de
      // `submitCatalogContribution`) : `build` la montre déjà entière.
      summary += `\nThis completes ${user.name}'s correction awaiting review on this event: both are sent as one.`;
    } else if (replaced) {
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

// ─── Confirmations ──────────────────────────────────────────────────────────

/** La fiche de chaque donnée à confirmer, sur le site. */
const CONFIRM_PATHS: Record<ConfirmSubject, (slug: string) => string> = {
  prices: (slug) => `/items/${slug}`,
  services: (slug) => `/lieux/${slug}`,
  sources: (slug) => `/crafting/blueprints/${slug}`,
};

/**
 * La donnée telle que le site la montre, pour que le joueur sache ce qu'il
 * confirme. `null` quand la fiche n'a rien à confirmer — la même règle que
 * `lib/confirmations.ts`.
 */
async function confirmedData(
  subject: ConfirmSubject,
  slug: string,
): Promise<{ slug: string; name: string; what: string; data: string } | null> {
  switch (subject) {
    case "prices": {
      const item = await getItemBySlug(slug);
      const markets = item?.resource?.markets;
      if (!item || !markets?.length) return null;
      return {
        slug: item.slug,
        name: item.name,
        what: `the market prices of “${item.name}”`,
        data: markets
          .slice(0, 8)
          .map((m) => `${m.location} (${m.side}): ${m.price} aUEC`)
          .join("; ")
          .concat(markets.length > 8 ? `; and ${markets.length - 8} more` : ""),
      };
    }
    case "services": {
      const place = await getPlaceBySlug(slug);
      if (!place?.services?.length) return null;
      return {
        slug: place.slug,
        name: place.name,
        what: `the services of “${place.name}”`,
        data: place.services.join(", "),
      };
    }
    case "sources": {
      const blueprint = await getBlueprintBySlug(slug);
      if (!blueprint?.obtention) return null;
      return {
        slug: blueprint.slug,
        name: blueprint.name,
        what: `where to obtain the blueprint “${blueprint.name}”`,
        data: blueprint.obtention,
      };
    }
  }
}

const NOTHING_TO_CONFIRM: Record<ConfirmSubject, string> = {
  prices: "No item with market prices at this slug.",
  services: "No place with listed services at this slug.",
  sources: "No blueprint with obtention details at this slug.",
};

// ─── Suivi ──────────────────────────────────────────────────────────────────

const myContributionSchema = z.object({
  id: z.string(),
  kind: z.string(),
  kindLabel: z.string(),
  target: z.object({ type: z.string(), slug: z.string(), name: z.string() }),
  status: z.string(),
  statusLabel: z.string(),
  points: z.number(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  publishedAt: z.string().optional(),
  fields: z.array(z.string()).optional(),
  review: z
    .object({
      at: z.string(),
      by: z.string().optional(),
      reason: z.string().optional(),
      reasonLabel: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  /** Pour une contribution à corriger : refusée d'office passé ce moment. */
  fixBefore: z.string().optional(),
  url: z.string(),
  resumeUrl: z.string().optional(),
});

type MyContribution = z.infer<typeof myContributionSchema>;

/** Une contribution telle que la page `/contributions` la montre à son auteur. */
function toMyContribution(c: Contribution): MyContribution {
  const open = c.status === "pending" || c.status === "changesRequested";
  const fixBefore =
    c.status === "changesRequested" && c.review?.at
      ? new Date(
          new Date(c.review.at).getTime() + CHANGES_REQUESTED_TTL_DAYS * DAY_MS,
        ).toISOString()
      : undefined;
  return {
    id: c.id,
    kind: c.kind,
    kindLabel: KIND_LABELS[c.kind] ?? c.kind,
    target: {
      type: c.target.type,
      slug: c.target.slug,
      name: c.target.name ?? c.target.slug,
    },
    status: c.status,
    statusLabel: STATUS_LABELS[c.status] ?? c.status,
    points: c.points,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    publishedAt: c.publishedAt,
    fields: c.changes?.length
      ? c.changes.map((change) => change.field).slice(0, 6)
      : undefined,
    review:
      c.review && (c.review.reason || c.review.message)
        ? {
            at: c.review.at,
            by: c.review.byName,
            reason: c.review.reason,
            reasonLabel: c.review.reason ? REASONS[c.review.reason] : undefined,
            message: c.review.message,
          }
        : undefined,
    fixBefore,
    url: siteUrl(targetHref(c)),
    resumeUrl: open && c.kind !== "media" ? siteUrl(resumeHref(c)) : undefined,
  };
}

function myContributionLine(c: MyContribution): string {
  const points =
    c.status === "pending" || c.status === "changesRequested"
      ? c.points > 0
        ? `, ${c.points} pts once published`
        : ""
      : c.points !== 0
        ? `, ${c.points} pts${c.status === "rejected" || c.status === "reverted" ? " (not counted)" : ""}`
        : "";
  const review = c.review
    ? ` — ${[c.review.reasonLabel, c.review.message ? `“${c.review.message}”` : undefined].filter(Boolean).join(": ")}${c.review.by ? ` (${c.review.by})` : ""}`
    : "";
  const fix = c.resumeUrl
    ? ` [${c.status === "changesRequested" ? "fix it" : "edit it"}](${c.resumeUrl})${c.fixBefore ? ` before ${c.fixBefore.slice(0, 10)}` : ""}`
    : "";
  return `- **${c.statusLabel}** · ${c.kindLabel}: [${c.target.name.replace(/[[\]]/g, "")}](${c.url})${points}${review}${fix}`;
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
        "Propose changes to a place of the catalog (get_place shows the current entry): description, type, services, player tip, shop category, sold items, or its parent (moving it with everything inside it). Only the fields given change. Below contributor level 4, a move is always reviewed by the community. Moved to another star system, a position read in the old one is removed. Asks the user to confirm first.",
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
          parent: z
            .string()
            .optional()
            .describe(
              "Slug of the new parent place (search_places): the place moves there with everything inside it. Not a shop, nor a place it contains.",
            ),
        }),
        ...metaParams,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: placeEditChallenge,
    },
    async ({ place, changes, source, gameVersion, confirm }, ctx) => {
      const { parent, ...rest } = changes;
      const input = parent ? { ...rest, parentSlug: parent } : rest;
      return contribute(
        ctx,
        (level) => buildPlaceEdit(place, input, level),
        { kind: "placeEdit", slug: place, input },
        { source, gameVersion },
        confirm,
      );
    },
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

  server.registerTool(
    "contribute_item_create",
    {
      title: "Contribute a new item",
      description:
        "Propose an item missing from the catalog, as the /items/proposer form does (search_items first: an item whose name gives the same address is refused as a duplicate). The address (slug) follows the name; the image is added later by the team. Optional blocks follow the shape get_item returns: `vehicle` for kind vehicle, `weapon` for kind weapon, `resource` for kind resource (the others are dropped). Goes to community review unless the user is a trusted contributor (level 3 or more). Asks the user to confirm first.",
      inputSchema: z.object({
        item: z.object({
          name: z
            .string()
            .min(1)
            .max(120)
            .describe("Name as the game shows it"),
          kind: z.enum(ITEM_KINDS),
          category: z
            .string()
            .min(1)
            .max(120)
            .describe(
              "Category, ideally an existing one from list_item_facets",
            ),
          subcategory: z.string().max(120).optional(),
          manufacturer: z.string().max(120).optional(),
          description: z.string().max(5000).optional(),
          size: z.number().optional(),
          tier: z.number().optional(),
          statistics: z
            .record(
              z.string(),
              z.object({
                value: z.union([z.string(), z.number()]),
                unit: z.string().max(24).optional(),
              }),
            )
            .optional()
            .describe('Figures by name, e.g. {"Damage": {"value": 40}}'),
          obtention: z
            .string()
            .max(5000)
            .optional()
            .describe("Where and how to get it in game"),
          blueprintSlugs: z
            .array(z.string())
            .optional()
            .describe(
              "Slugs of the blueprints that craft it (search_blueprints)",
            ),
          variantGroup: z
            .string()
            .max(120)
            .optional()
            .describe("Shared key of the variants of the same item"),
          variantName: z.string().max(120).optional(),
          setName: z
            .string()
            .max(120)
            .optional()
            .describe("Armor set or collection it belongs to"),
          vehicle: z.record(z.string(), z.unknown()).optional(),
          weapon: z.record(z.string(), z.unknown()).optional(),
          resource: z.record(z.string(), z.unknown()).optional(),
        }),
        ...metaParams,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: itemCreateChallenge,
    },
    async ({ item, source, gameVersion, confirm }, ctx) =>
      contribute(
        ctx,
        () => buildItemCreate(item),
        { kind: "itemCreate", input: item },
        { source, gameVersion },
        confirm,
        (summary) => `${summary}\nThe image is added later by the Nexus team.`,
      ),
  );

  server.registerTool(
    "confirm_data",
    {
      title: "Confirm or flag data that ages",
      description:
        "Confirm, as the site's “Still accurate / No longer accurate” buttons do, data that ages with patches: `sources` = where to obtain a blueprint (slug from search_blueprints), `prices` = the market prices of a resource item (slug from search_items), `services` = the services of a place (slug from search_places). accurate: true dates the data today; false flags it outdated, and the third player to do so opens a report for moderators. Published right away (no review), 1 point within 5 a day, once a week per data and player. Asks the user to confirm first.",
      inputSchema: z.object({
        subject: z.enum(CONFIRM_SUBJECTS),
        slug: z
          .string()
          .min(1)
          .max(200)
          .describe("Slug of the blueprint, item or place"),
        accurate: z
          .boolean()
          .describe("true: still accurate in game; false: no longer accurate"),
        comment: z
          .string()
          .max(MAX_CONFIRM_COMMENT_LENGTH)
          .optional()
          .describe("What changed, when flagging outdated data"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        points: z.number(),
        confirmedAt: z.string(),
        reported: z.boolean(),
        contributorPoints: z.number(),
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: confirmChallenge,
    },
    async ({ subject, slug, accurate, comment, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const author = { id: new ObjectId(user.id), name: user.name };
      try {
        const standing = await getStanding(author.id);
        if (standing.suspendedUntil) {
          throw new ContributionError("suspended", 403);
        }
        const [data, state] = await Promise.all([
          confirmedData(subject, slug),
          getConfirmState(subject, slug, author.id),
        ]);
        if (!data || !state) return toolError(NOTHING_TO_CONFIRM[subject]);
        if (state.mine) throw new ContributionError("alreadyConfirmed", 409);

        const url = siteUrl(CONFIRM_PATHS[subject](data.slug));
        const last = state.confirmedAt
          ? `last confirmed ${state.confirmedAt.slice(0, 10)}`
          : "never confirmed";
        const summary = accurate
          ? `Confirm, as ${user.name}, as still accurate in game: ${data.what} (${last}).\nCurrently: ${data.data}\nPublished right away; earns ${POINTS.confirm} point (within ${CONFIRM_DAILY_CAP} confirmations a day).`
          : `Report, as ${user.name}, as no longer accurate in game: ${data.what} (${last}).\nCurrently: ${data.data}${comment ? `\nComment: “${comment}”.` : ""}\n${state.outdatedVotes} other player(s) already said so; at ${OUTDATED_VOTES}, a report opens for moderators.`;
        const confirmation = confirmWrite(ctx, summary, confirm);
        if (!confirmation.confirmed) return confirmation.result;

        const result = await submitConfirmation(author, {
          target: { slug: data.slug },
          subject,
          accurate,
          comment,
        });
        return toolResult(
          {
            status: "done",
            summary,
            points: result.confirmation.points,
            confirmedAt: result.confirmation.at,
            reported: result.reported,
            contributorPoints: result.standing.points,
            url,
          },
          `${accurate ? "Confirmed" : "Flagged as outdated"}: ${mdLink(data.name, CONFIRM_PATHS[subject](data.slug))}. ` +
            (result.confirmation.points > 0
              ? `+${result.confirmation.points} point; ${user.name} now has ${result.standing.points}.`
              : `No point this time (daily limit of ${CONFIRM_DAILY_CAP} reached).`) +
            (result.reported
              ? " A report was opened for moderators to update it."
              : ""),
        );
      } catch (error) {
        if (error instanceof ContributionError) {
          return toolError(`Not sent: ${contributionErrorText(error)}`);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "list_my_contributions",
    {
      title: "List my contributions",
      description:
        "The signed-in player's contributions, latest activity first, as on their /contributions page: what they propose (new or corrected places, items, plans, images, missions, confirmations), with the status (in review, published, needs changes with the reviewer's reason and message and the date to fix it before, rejected with the reason, reverted), the points, a link to the entry and, while it is open, the link to edit it on the site.",
      inputSchema: z.object({
        status: z
          .enum(CONTRIBUTION_STATUSES)
          .exclude(["publishing"])
          .optional()
          .describe("Only this status, among the latest 200 contributions"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        contributions: z.array(myContributionSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: mineChallenge,
    },
    async ({ status, limit = 20 }, ctx) => {
      const user = await currentUser(ctx);
      const recent = await listMyContributions(
        new ObjectId(user.id),
        status ? 200 : limit,
      );
      const matching = status
        ? recent.filter((c) => c.status === status)
        : recent;
      const contributions = matching.slice(0, limit).map(toMyContribution);
      const toFix = contributions.filter(
        (c) => c.status === "changesRequested",
      ).length;
      return toolResult(
        {
          total: matching.length,
          contributions,
          url: siteUrl(CONTRIBUTIONS_PATH),
        },
        contributions.length === 0
          ? `${user.name} has no contribution${status ? ` with status ${status}` : ""} yet. ${mdLink("My contributions", CONTRIBUTIONS_PATH)}`
          : `${user.name}'s contributions (${contributions.length}${matching.length > contributions.length ? ` of ${matching.length}` : ""})` +
              (toFix > 0 ? `, ${toFix} to fix:` : ":") +
              "\n" +
              contributions.map(myContributionLine).join("\n") +
              `\n\n${mdLink("My contributions", CONTRIBUTIONS_PATH)}`,
      );
    },
  );
}
