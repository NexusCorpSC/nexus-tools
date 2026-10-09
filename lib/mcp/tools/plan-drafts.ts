import "server-only";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { ContributionError } from "@/lib/contribution-store";
import { submitCatalogContribution } from "@/lib/contributions";
import { getPlaceBySlug, getPlacePlans } from "@/lib/places";
import {
  applyDraftOps,
  countOpenDrafts,
  createDraft,
  deleteDraft,
  DraftOpError,
  existingPlaceSlugs,
  getDraft,
  listDrafts,
  MAX_OPEN_DRAFTS,
  newElementId,
  normalizeDraftPlan,
  planAnomalies,
  planOutline,
  saveDraftPlan,
  type DbPlanDraft,
  type DraftOp,
} from "@/lib/plan-drafts";
import {
  previewOptions,
  renderPlatePng,
  uploadPlanPreview,
} from "@/lib/plan-preview";
import { PLAN_GLYPHS } from "@/lib/plan-symbols";
import {
  DOOR_KINDS,
  isDrawnPlan,
  MAX_PLAN_EXTENT_CM,
  PLACE_SERVICES,
  ROOM_FILLS,
  ROOM_KINDS,
  type DrawnPlacePlan,
} from "@/types/places";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { jsonBlock, siteUrl, toolError, toolResult } from "../format";
import { contributionErrorText } from "./contributions";
import { placePath } from "./places";

const challenges = Object.fromEntries(
  [
    "plan_draft_create",
    "plan_draft_get",
    "plan_draft_edit",
    "plan_draft_replace",
    "plan_draft_render",
    "plan_draft_submit",
    "plan_draft_discard",
  ].map((name) => [name, personalTool(name, "contributions:write")]),
);

const DRAFT_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const cm = z.number().int().min(-MAX_PLAN_EXTENT_CM).max(MAX_PLAN_EXTENT_CM);
const length = z.number().int().min(1).max(MAX_PLAN_EXTENT_CM);
const elementId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,40}$/)
  .optional()
  .describe("Optional id of your choice, to refer to it in later operations");

const opSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set_plan"),
    name: z.string().min(1).max(120).optional(),
    note: z.string().max(4000).optional(),
    widthCm: length.optional(),
    heightCm: length.optional(),
  }),
  z.object({
    op: z.literal("add_level"),
    id: elementId,
    name: z.string().min(1).max(120),
    position: z
      .enum(["top", "bottom"])
      .optional()
      .describe("Above the others (default) or below (a basement)"),
  }),
  z.object({
    op: z.literal("rename_level"),
    levelId: z.string(),
    name: z.string().min(1).max(120),
  }),
  z.object({
    op: z.literal("add_room"),
    levelId: z.string(),
    id: elementId,
    name: z.string().max(120),
    kind: z.enum(ROOM_KINDS),
    fill: z.enum(ROOM_FILLS).optional(),
    x: cm.optional().describe("Left edge, cm"),
    y: cm.optional().describe("Top edge, cm"),
    w: length.optional(),
    h: length.optional(),
    points: z
      .array(cm)
      .min(6)
      .max(80)
      .optional()
      .describe(
        "Polygon vertices [x0, y0, x1, y1, …] for a room that is not a rectangle (an L-shaped building is one room)",
      ),
    rot: z.number().int().min(-180).max(180).optional(),
    stair: z.enum(["up", "down"]).optional(),
    label: z.boolean().optional().describe("Print the name (default true)"),
    note: z.string().max(120).optional(),
    nextTo: z
      .object({
        room: z.string().describe("Id or name of a room on the same level"),
        side: z.enum(["north", "south", "east", "west"]),
        gap: z.number().int().min(0).optional(),
        align: z.enum(["start", "center", "end"]).optional(),
      })
      .optional()
      .describe("Place the room against another one instead of giving x/y"),
  }),
  z.object({
    op: z.literal("add_wall"),
    levelId: z.string(),
    id: elementId,
    x1: cm,
    y1: cm,
    x2: cm,
    y2: cm,
    thickness: length.optional().describe("Default 20 cm"),
  }),
  z.object({
    op: z.literal("add_door"),
    levelId: z.string(),
    id: elementId,
    x: cm.describe("A point on or near the wall, cm"),
    y: cm,
    kind: z.enum(DOOR_KINDS).optional(),
    width: length.optional().describe("Default 130 cm"),
    snap: z
      .boolean()
      .optional()
      .describe("Snap to the nearest room edge or wall (default true)"),
  }),
  z.object({
    op: z.literal("add_label"),
    levelId: z.string(),
    id: elementId,
    text: z.string().min(1).max(120),
    x: cm,
    y: cm,
    rot: z.number().int().min(-180).max(180).optional(),
  }),
  z.object({
    op: z.literal("add_measure"),
    levelId: z.string(),
    id: elementId,
    x1: cm,
    y1: cm,
    x2: cm,
    y2: cm,
  }),
  z.object({
    op: z.literal("add_marker"),
    levelId: z.string().optional(),
    id: elementId,
    x: cm.describe("Position in cm, converted to a fraction of the extent"),
    y: cm,
    place: z
      .string()
      .optional()
      .describe("Slug of the place this marker opens (a shop, a hangar…)"),
    service: z.enum(PLACE_SERVICES).optional(),
    glyph: z.enum(Object.keys(PLAN_GLYPHS) as [string, ...string[]]).optional(),
    label: z.string().max(120).optional(),
    note: z.string().max(120).optional(),
  }),
  z.object({
    op: z.literal("update"),
    id: z.string(),
    set: z
      .record(z.string(), z.unknown())
      .describe(
        "Fields to change, as in the plan format (markers take x/y in cm and place)",
      ),
  }),
  z.object({
    op: z.literal("move"),
    id: z.string(),
    dx: cm,
    dy: cm,
  }),
  z.object({ op: z.literal("remove"), id: z.string() }),
]);

const outlineSchema = z.object({
  id: z.string(),
  name: z.string(),
  widthCm: z.number(),
  heightCm: z.number(),
  markers: z.number(),
  levels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rooms: z.number(),
      walls: z.number(),
      doors: z.number(),
      labels: z.number(),
      measures: z.number(),
    }),
  ),
});

const draftSummary = z.object({
  draftId: z.string(),
  place: z.string(),
  placeName: z.string(),
  basedOn: z.string().optional(),
  expiresAt: z.string(),
  outline: outlineSchema,
});

function summarize(draft: DbPlanDraft) {
  return {
    draftId: draft._id.toString(),
    place: draft.placeSlug,
    placeName: draft.placeName,
    basedOn: draft.basedOn ?? undefined,
    expiresAt: draft.expiresAt.toISOString(),
    outline: planOutline(draft.plan),
  };
}

function outlineText(plan: DrawnPlacePlan): string {
  return plan.levels
    .map(
      (level) =>
        `- ${level.name} (level id: ${level.id}): ${level.rooms.length} rooms, ${level.walls.length} walls, ${level.doors.length} doors, ${level.labels.length} labels, ${level.measures.length} measures`,
    )
    .join("\n");
}

async function draftFor(ctx: ServerContext, draftId: string) {
  const user = await currentUser(ctx);
  const draft = await getDraft(user.id, draftId);
  return { user, draft };
}

const NO_DRAFT = (draftId: string) =>
  toolError(
    `No open draft ${draftId}. Drafts expire 7 days after their last change; list yours with plan_draft_get.`,
  );

/** Range le plan normalisé et dit ce qui a été écarté et ce qui cloche. */
async function store(
  draft: DbPlanDraft,
  raw: unknown,
): Promise<
  | { ok: true; plan: DrawnPlacePlan; dropped: string[]; issues: string[] }
  | { ok: false; error: string }
> {
  const normalized = normalizeDraftPlan(raw, draft.placeSlug, {
    id: draft.plan.id,
  });
  if (!normalized) {
    return { ok: false, error: "The plan is not valid (it needs a name)." };
  }
  if (normalized.plan.levels.length === 0) {
    return { ok: false, error: "A plan keeps at least one level." };
  }
  await saveDraftPlan(draft, normalized.plan);
  const issues = planAnomalies(
    normalized.plan,
    await existingPlaceSlugs(normalized.plan),
  );
  return { ok: true, ...normalized, issues };
}

function storedText(dropped: string[], issues: string[]): string {
  return (
    (dropped.length
      ? `\n\nDropped as invalid or over the limits: ${dropped.join(", ")}.`
      : "") +
    (issues.length
      ? `\n\nTo check:\n${issues.map((issue) => `- ${issue}`).join("\n")}`
      : "\n\nNo anomaly detected.")
  );
}

export function registerPlanDraftTools(server: McpServer) {
  server.registerTool(
    "plan_draft_create",
    {
      title: "Start a place map draft",
      description:
        "Start drawing the map (drawn plan) of a place: an empty draft with one level, or a copy of one of the place's existing drawn plans to correct it. Read the format first: resource nexus://docs/plan-format. Drafts are private to the user and expire after 7 days without changes; nothing is published before plan_draft_submit.",
      inputSchema: z.object({
        place: z.string().describe("Slug of the place"),
        fromPlanId: z
          .string()
          .optional()
          .describe(
            "Id of an existing drawn plan of this place to edit (get_place lists them)",
          ),
        name: z
          .string()
          .min(1)
          .max(120)
          .optional()
          .describe("Plan name, e.g. 'Main building'"),
        widthCm: length.optional().describe("Extent width in cm"),
        heightCm: length.optional().describe("Extent height in cm"),
        levelName: z
          .string()
          .max(120)
          .optional()
          .describe("Name of the first level (default 'Rez-de-chaussée')"),
      }),
      outputSchema: draftSummary,
      annotations: DRAFT_WRITE,
      scopeChallenge: challenges.plan_draft_create,
    },
    async ({ place, fromPlanId, name, widthCm, heightCm, levelName }, ctx) => {
      const user = await currentUser(ctx);
      if ((await countOpenDrafts(user.id)) >= MAX_OPEN_DRAFTS) {
        return toolError(
          `You already have ${MAX_OPEN_DRAFTS} open drafts: submit or discard one first (plan_draft_get lists them).`,
        );
      }
      const found = await getPlaceBySlug(place);
      if (!found) return toolError(`Unknown place: ${place}.`);

      let plan: DrawnPlacePlan;
      if (fromPlanId) {
        const plans = await getPlacePlans(place);
        const existing = plans?.plans.find((one) => one.id === fromPlanId);
        if (!existing) {
          return toolError(`${found.name} has no plan ${fromPlanId}.`);
        }
        if (existing.borrowedFrom) {
          return toolError(
            `This plan belongs to ${existing.borrowedFrom.name} (${existing.borrowedFrom.slug}): edit it there, with fromPlanId ${existing.borrowedFrom.planId}.`,
          );
        }
        if (!isDrawnPlan(existing)) {
          return toolError(
            "This plan is an image: only drawn plans can be edited here.",
          );
        }
        plan = structuredClone(existing);
        if (name) plan.name = name;
      } else {
        if (!widthCm || !heightCm) {
          return toolError(
            "Give the extent of the new plan: widthCm and heightCm.",
          );
        }
        plan = {
          id: newElementId(),
          kind: "drawn",
          name: name ?? found.name,
          markers: [],
          widthCm,
          heightCm,
          levels: [
            {
              id: newElementId(),
              name: levelName || "Rez-de-chaussée",
              order: 0,
              rooms: [],
              walls: [],
              doors: [],
              labels: [],
              measures: [],
            },
          ],
        };
      }
      const normalized = normalizeDraftPlan(plan, found.slug, { id: plan.id });
      if (!normalized) return toolError("Could not start this plan.");
      const draft = await createDraft({
        userId: user.id,
        placeSlug: found.slug,
        placeName: found.name,
        plan: normalized.plan,
        basedOn: fromPlanId,
      });
      return toolResult(
        summarize(draft),
        `Draft ${draft._id} started for ${found.name} (${normalized.plan.widthCm}×${normalized.plan.heightCm} cm):\n${outlineText(normalized.plan)}\n\nAdd rooms, walls and doors with plan_draft_edit, look at it with plan_draft_render.`,
      );
    },
  );

  server.registerTool(
    "plan_draft_get",
    {
      title: "Read a map draft",
      description:
        "Read a draft in full (every level, room, wall, door, label, measure and marker with its id, in cm), or, without draftId, list the user's open drafts.",
      inputSchema: z.object({ draftId: z.string().optional() }),
      outputSchema: z.object({
        drafts: z.array(draftSummary).optional(),
        draft: draftSummary.optional(),
        plan: z.looseObject({}).optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopeChallenge: challenges.plan_draft_get,
    },
    async ({ draftId }, ctx) => {
      const user = await currentUser(ctx);
      if (!draftId) {
        const drafts = (await listDrafts(user.id)).map(summarize);
        return toolResult(
          { drafts },
          drafts.length
            ? drafts
                .map(
                  (d) =>
                    `- ${d.draftId}: ${d.outline.name} — ${d.placeName} (${d.place}), expires ${d.expiresAt}`,
                )
                .join("\n")
            : "No open draft.",
        );
      }
      const draft = await getDraft(user.id, draftId);
      if (!draft) return NO_DRAFT(draftId);
      return toolResult(
        { draft: summarize(draft), plan: draft.plan },
        `${draft.plan.name} — ${draft.placeName}\n${outlineText(draft.plan)}\n\n${jsonBlock(draft.plan)}`,
      );
    },
  );

  server.registerTool(
    "plan_draft_edit",
    {
      title: "Edit a map draft",
      description:
        "Apply a batch of operations to a draft, all or nothing: add_level, rename_level, add_room (x/y/w/h, polygon points, or nextTo another room), add_wall (a segment), add_door (snapped to the nearest wall), add_label, add_measure, add_marker (cm, converted), update, move, remove. Coordinates are integer cm from the top-left corner of the extent; north is up. Returns the ids created and the anomalies to check.",
      inputSchema: z.object({
        draftId: z.string(),
        ops: z.array(opSchema).min(1).max(200),
      }),
      outputSchema: z.object({
        created: z.array(z.object({ op: z.number(), id: z.string() })),
        dropped: z.array(z.string()),
        issues: z.array(z.string()),
        outline: outlineSchema,
      }),
      annotations: DRAFT_WRITE,
      scopeChallenge: challenges.plan_draft_edit,
    },
    async ({ draftId, ops }, ctx) => {
      const { draft } = await draftFor(ctx, draftId);
      if (!draft) return NO_DRAFT(draftId);
      let result;
      try {
        result = applyDraftOps(draft.plan, ops as DraftOp[]);
      } catch (error) {
        if (error instanceof DraftOpError) {
          return toolError(`Nothing was changed. ${error.message}.`);
        }
        throw error;
      }
      const stored = await store(draft, result.plan);
      if (!stored.ok) return toolError(`Nothing was changed. ${stored.error}`);
      return toolResult(
        {
          created: result.created,
          dropped: stored.dropped,
          issues: stored.issues,
          outline: planOutline(stored.plan),
        },
        `Applied ${ops.length} operations.` +
          (result.created.length
            ? ` Created ids: ${result.created.map((c) => `#${c.op} → ${c.id}`).join(", ")}.`
            : "") +
          `\n${outlineText(stored.plan)}` +
          storedText(stored.dropped, stored.issues),
      );
    },
  );

  server.registerTool(
    "plan_draft_replace",
    {
      title: "Replace a map draft",
      description:
        "Replace the whole draft with a plan document in the drawn plan format (see nexus://docs/plan-format): for agents that prefer writing the plan in one go. Every element needs an id. The plan keeps the draft's own id.",
      inputSchema: z.object({
        draftId: z.string(),
        plan: z.looseObject({
          name: z.string(),
          widthCm: z.number(),
          heightCm: z.number(),
          levels: z.array(z.looseObject({})),
          markers: z.array(z.looseObject({})).optional(),
        }),
      }),
      outputSchema: z.object({
        dropped: z.array(z.string()),
        issues: z.array(z.string()),
        outline: outlineSchema,
      }),
      annotations: { ...DRAFT_WRITE, destructiveHint: true },
      scopeChallenge: challenges.plan_draft_replace,
    },
    async ({ draftId, plan }, ctx) => {
      const { draft } = await draftFor(ctx, draftId);
      if (!draft) return NO_DRAFT(draftId);
      const stored = await store(draft, { markers: [], ...plan });
      if (!stored.ok) return toolError(`Nothing was changed. ${stored.error}`);
      return toolResult(
        {
          dropped: stored.dropped,
          issues: stored.issues,
          outline: planOutline(stored.plan),
        },
        `Draft replaced.\n${outlineText(stored.plan)}` +
          storedText(stored.dropped, stored.issues),
      );
    },
  );

  server.registerTool(
    "plan_draft_render",
    {
      title: "Look at a map draft",
      description:
        "Render a draft as a PNG image, one level or all of them side by side, exactly as the published plate will look, plus the list of anomalies to check (overlapping rooms, rooms outside the extent, doors off a wall, markers to unknown places).",
      inputSchema: z.object({
        draftId: z.string(),
        levelId: z.string().optional().describe("Only this level"),
        width: z
          .number()
          .int()
          .min(400)
          .max(2400)
          .optional()
          .describe("Image width in pixels (default 1400)"),
      }),
      outputSchema: z.object({
        issues: z.array(z.string()),
        width: z.number(),
        height: z.number(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopeChallenge: challenges.plan_draft_render,
    },
    async ({ draftId, levelId, width = 1400 }, ctx) => {
      const { draft } = await draftFor(ctx, draftId);
      if (!draft) return NO_DRAFT(draftId);
      if (levelId && !draft.plan.levels.some((one) => one.id === levelId)) {
        return toolError(`Unknown level ${levelId}.`);
      }
      const plate = await renderPlatePng(draft.plan, {
        ...previewOptions(
          draft.plan,
          draft.placeName,
          levelId ? [levelId] : undefined,
        ),
        width,
      });
      const issues = planAnomalies(
        draft.plan,
        await existingPlaceSlugs(draft.plan),
      );
      return {
        content: [
          {
            type: "image",
            data: plate.png.toString("base64"),
            mimeType: "image/png",
          },
          {
            type: "text",
            text: issues.length
              ? `To check:\n${issues.map((issue) => `- ${issue}`).join("\n")}`
              : "No anomaly detected.",
          },
        ],
        structuredContent: {
          issues,
          width: plate.width,
          height: plate.height,
        },
      };
    },
  );

  server.registerTool(
    "plan_draft_submit",
    {
      title: "Submit a map draft",
      description:
        "Send the draft as a contribution to the place's maps: published right away for trusted contributors (level 3+), reviewed by the community otherwise. The preview image is rendered and stored, and the draft is closed. Asks the user to confirm first.",
      inputSchema: z.object({
        draftId: z.string(),
        source: z
          .string()
          .max(500)
          .optional()
          .describe("How it was surveyed: in game, from screenshots…"),
        gameVersion: z.string().max(40).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        contributionId: z.string(),
        contributionStatus: z.string(),
        url: z.string(),
      }),
      annotations: DRAFT_WRITE,
      scopeChallenge: challenges.plan_draft_submit,
    },
    async ({ draftId, source, gameVersion, confirm }, ctx) => {
      const { user, draft } = await draftFor(ctx, draftId);
      if (!draft) return NO_DRAFT(draftId);
      const plan = draft.plan;
      const rooms = plan.levels.reduce((sum, l) => sum + l.rooms.length, 0);
      if (rooms === 0) return toolError("The draft has no room yet.");
      const issues = planAnomalies(plan, await existingPlaceSlugs(plan));

      const summary =
        `Propose, as ${user.name}, the map “${plan.name}” of ${draft.placeName}` +
        (draft.basedOn
          ? " (a correction of its existing plan)"
          : " (a new plan)") +
        `: ${plan.levels.length} levels, ${rooms} rooms, ${plan.markers.length} markers.` +
        (issues.length
          ? ` ${issues.length} possible anomalies remain (see plan_draft_render).`
          : "");
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let preview = null;
      try {
        preview = await uploadPlanPreview(
          plan,
          draft.placeSlug,
          draft.placeName,
        );
      } catch (error) {
        // Comme dans l'éditeur : sans aperçu, le relevé part quand même.
        console.error("plan preview", error);
      }
      try {
        const { contribution } = await submitCatalogContribution(
          { id: new ObjectId(user.id), name: user.name },
          {
            kind: "plan",
            slug: draft.placeSlug,
            plan: preview ? { ...plan, preview } : plan,
          },
          { source, gameVersion },
        );
        await deleteDraft(user.id, draftId);
        const published = contribution.status === "published";
        return toolResult(
          {
            status: "done",
            summary,
            contributionId: contribution.id,
            contributionStatus: contribution.status,
            url: siteUrl(placePath(draft.placeSlug)),
          },
          published
            ? `Published on ${siteUrl(placePath(draft.placeSlug))}. The draft is closed.`
            : `Sent for review (contribution ${contribution.id}). The draft is closed; the plan will appear on ${siteUrl(placePath(draft.placeSlug))} once reviewed.`,
        );
      } catch (error) {
        if (error instanceof ContributionError) {
          return toolError(
            `Not sent: ${contributionErrorText(error)} The draft is kept.`,
          );
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "plan_draft_discard",
    {
      title: "Discard a map draft",
      description: "Delete a draft that will not be submitted.",
      inputSchema: z.object({ draftId: z.string() }),
      outputSchema: z.object({ discarded: z.boolean() }),
      annotations: { ...DRAFT_WRITE, destructiveHint: true },
      scopeChallenge: challenges.plan_draft_discard,
    },
    async ({ draftId }, ctx) => {
      const user = await currentUser(ctx);
      const discarded = await deleteDraft(user.id, draftId);
      if (!discarded) return NO_DRAFT(draftId);
      return toolResult({ discarded }, `Draft ${draftId} discarded.`);
    },
  );
}
