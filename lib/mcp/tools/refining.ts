import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  checkCollectInput,
  checkJobInput,
  formatDurationInput,
  isFinished,
  isInertMaterial,
  minutesLeft,
  parseDuration,
  REFINING_METHODS,
  totalQuantity,
  type RefiningJob,
  type RefiningLine,
} from "@/lib/refining";
import {
  collectRefiningJob,
  createRefiningJob,
  deleteRefiningJob,
  getRefiningJob,
  listRefiningJobs,
  RefiningError,
  updateRefiningJob,
} from "@/lib/refining-jobs";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";
import { locate } from "./inventory";

/**
 * Les ordres de raffinage du joueur : les mêmes fonctions que la page
 * `/industry/refine` et l'app (`lib/refining-jobs.ts`), les mêmes contrôles
 * de saisie (`lib/refining.ts`). Collecter range les lignes dans l'inventaire
 * et supprime l'ordre, comme le bouton Collecter.
 */

const REFINING_PATH = "/industry/refine";

const listChallenge = personalTool("list_refining_jobs", "refining:read");
const startChallenge = personalTool("start_refining_job", "refining:write");
const updateChallenge = personalTool("update_refining_job", "refining:write");
const collectChallenge = personalTool("collect_refining_job", "refining:write");
const deleteChallenge = personalTool("delete_refining_job", "refining:write");

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const lineSchema = z.object({
  name: z.string(),
  quality: z.number().optional(),
  quantity: z.number(),
});

const lineInput = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .describe("Material, as the refinery terminal names it"),
  quality: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .describe("Quality out of 1000; omit when the terminal shows none"),
  quantity: z.number().positive().describe("Yield in cSCU (100 cSCU = 1 SCU)"),
});

const durationInput = z
  .union([z.number().int().positive(), z.string().min(1)])
  .describe(
    'Processing time as the terminal shows it, e.g. "1d3h35m", "45m", or a number of minutes',
  );

const jobSchema = z.object({
  id: z.string(),
  location: z.string(),
  locationId: z.string().optional(),
  method: z.string().optional(),
  lines: z.array(lineSchema),
  content: z.string().optional(),
  cost: z.number().optional(),
  note: z.string().optional(),
  duration: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  ready: z.boolean(),
  minutesLeft: z.number(),
  totalQuantity: z.number(),
});

/**
 * Un ordre pour l'assistant. La base garde `null` pour un champ laissé vide :
 * il devient absent, pour que le schéma de sortie et les comparaisons de
 * `update_refining_job` voient « rien » pareil.
 */
function normalize(job: RefiningJob): RefiningJob {
  return {
    ...job,
    method: job.method ?? undefined,
    cost: job.cost ?? undefined,
    note: job.note ?? undefined,
    content: job.content ?? undefined,
    lines: job.lines.map((line) => ({
      name: line.name,
      quality: line.quality ?? undefined,
      quantity: line.quantity,
    })),
  };
}

function toJob(raw: RefiningJob, now: number): z.infer<typeof jobSchema> {
  const job = normalize(raw);
  return {
    ...job,
    ready: isFinished(job, now),
    minutesLeft: minutesLeft(job, now),
    totalQuantity: totalQuantity(job.lines),
  };
}

function lineText(line: RefiningLine): string {
  return `${line.name}: ${line.quantity} cSCU${line.quality !== undefined ? `, quality ${line.quality}` : ""}`;
}

function jobLine(job: z.infer<typeof jobSchema>): string {
  const state = job.ready
    ? "ready to collect"
    : `${formatDurationInput(job.minutesLeft)} left (ends ${job.endTime})`;
  const details = [
    job.method,
    job.cost !== undefined ? `${job.cost} aUEC` : undefined,
    job.note ? `“${job.note}”` : undefined,
  ].filter(Boolean);
  const lines = job.lines.length
    ? job.lines.map((line) => `  - ${lineText(line)}`).join("\n")
    : job.content
      ? `  - ${job.content.replace(/\s*\n\s*/g, "; ")}`
      : "";
  return (
    `- ${job.location} (order: ${job.id}) — ${state}` +
    (details.length ? ` — ${details.join(", ")}` : "") +
    (lines ? `\n${lines}` : "")
  );
}

/** La durée en minutes ; undefined quand rien ne se lit (refusé par `checkJobInput`). */
function readDuration(value: number | string) {
  const minutes =
    typeof value === "number" ? value : parseDuration(String(value));
  return minutes ?? undefined;
}

function refiningError(error: unknown, what: string) {
  if (error instanceof RefiningError) {
    const reason =
      error.code === "not_found"
        ? "this refining order no longer exists"
        : error.code === "invalid_location"
          ? "unknown inventory location"
          : error.message;
    return toolError(`${what}: ${reason}.`);
  }
  throw error;
}

export function registerRefiningTools(server: McpServer) {
  server.registerTool(
    "list_refining_jobs",
    {
      title: "List my refining orders",
      description:
        "List the signed-in player's refining orders (refinery, method, materials with quality and cSCU yield, cost, time left), finished ones first. Order ids are what the other refining tools take.",
      inputSchema: z.object({
        status: z
          .enum(["ready", "running"])
          .optional()
          .describe("Only finished orders (ready) or those still processing"),
      }),
      outputSchema: z.object({
        total: z.number(),
        jobs: z.array(jobSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async ({ status }, ctx) => {
      const user = await currentUser(ctx);
      const now = Date.now();
      const jobs = (await listRefiningJobs(user.id))
        .map((job) => toJob(job, now))
        .filter((job) =>
          status === undefined ? true : job.ready === (status === "ready"),
        );
      return toolResult(
        { total: jobs.length, jobs, url: siteUrl(REFINING_PATH) },
        jobs.length
          ? `${jobs.length} orders in ${mdLink("your refining orders", REFINING_PATH)}:\n` +
              jobs.map(jobLine).join("\n")
          : `No refining order${status ? ` ${status === "ready" ? "ready" : "running"}` : ""} in ${mdLink("your refining orders", REFINING_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "start_refining_job",
    {
      title: "Track a refining order",
      description:
        "Start tracking a refining order the player just launched at a refinery terminal: refinery, method, the materials it will yield (quality, cSCU) and the processing time. The countdown starts now. Asks the user to confirm first.",
      inputSchema: z.object({
        location: z
          .string()
          .describe(
            "The refinery: inventory location id (search_inventory_locations), place slug or exact name",
          ),
        method: z.enum(REFINING_METHODS).optional(),
        lines: z.array(lineInput).min(1).max(40),
        duration: durationInput,
        cost: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Price paid, in aUEC"),
        note: z.string().max(500).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ job: jobSchema, url: z.string() }),
      annotations: WRITE,
      scopeChallenge: startChallenge,
    },
    async ({ location, method, lines, duration, cost, note, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const found = await locate(user.id, location);
      if (found.error) return found.error;
      const place = found.location;

      const checked = checkJobInput({
        locationId: place.id,
        method,
        lines,
        duration: readDuration(duration),
        cost,
        note,
      });
      if (!checked.ok) return toolError(`Nothing was saved: ${checked.error}.`);
      const input = checked.value;

      const summary =
        `Track a refining order at ${place.name}${input.method ? ` (${input.method})` : ""}, ready in ${formatDurationInput(input.duration)}:\n` +
        input.lines.map((line) => `- ${lineText(line)}`).join("\n") +
        (input.cost !== undefined ? `\nCost: ${input.cost} aUEC` : "") +
        (input.note ? `\nNote: “${input.note}”` : "");
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let job: RefiningJob;
      try {
        job = await createRefiningJob(user.id, input);
      } catch (error) {
        return refiningError(error, "Nothing was saved");
      }
      const shown = toJob(job, Date.now());
      return toolResult(
        { status: "done", summary, job: shown, url: siteUrl(REFINING_PATH) },
        `Done: the order at ${place.name} ends ${job.endTime}. See ${mdLink("your refining orders", REFINING_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "update_refining_job",
    {
      title: "Change a refining order",
      description:
        "Change one of the signed-in player's refining orders: its refinery, method, materials, processing time (counted from the original start), cost or note. Only the given fields change; lines replace all the order's lines. Asks the user to confirm first.",
      inputSchema: z.object({
        jobId: z.string().describe("Order id, from list_refining_jobs"),
        location: z
          .string()
          .optional()
          .describe("The refinery: location id, place slug or exact name"),
        method: z.enum(REFINING_METHODS).nullable().optional(),
        lines: z.array(lineInput).min(1).max(40).optional(),
        duration: durationInput.optional(),
        cost: z.number().int().min(0).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ job: jobSchema }),
      annotations: WRITE,
      scopeChallenge: updateChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const stored = await getRefiningJob(user.id, args.jobId);
      if (!stored) return toolError(`No refining order ${args.jobId}.`);
      const job = normalize(stored);

      let locationId = job.locationId;
      let locationName = job.location;
      if (args.location !== undefined) {
        const found = await locate(user.id, args.location);
        if (found.error) return found.error;
        locationId = found.location.id;
        locationName = found.location.name;
      }
      if (!locationId) {
        return toolError(
          `This older order only names its refinery as “${job.location}”: pass location (search_inventory_locations) to change it.`,
        );
      }
      const lines = args.lines ?? job.lines;
      if (lines.length === 0) {
        return toolError(
          "This older order has no material lines yet: pass lines to change it.",
        );
      }
      const duration =
        args.duration !== undefined
          ? readDuration(args.duration)
          : job.duration;

      const checked = checkJobInput({
        locationId,
        method: args.method === undefined ? job.method : args.method,
        lines,
        duration,
        cost: args.cost === undefined ? job.cost : args.cost,
        note: args.note === undefined ? job.note : args.note,
      });
      if (!checked.ok) {
        return toolError(`Nothing was changed: ${checked.error}.`);
      }
      const input = checked.value;

      const changes: string[] = [];
      if (locationId !== job.locationId) {
        changes.push(`refinery ${job.location} → ${locationName}`);
      }
      if (input.method !== job.method) {
        changes.push(
          `method ${job.method ?? "none"} → ${input.method ?? "none"}`,
        );
      }
      if (args.lines !== undefined) {
        changes.push(
          "materials:\n" +
            input.lines.map((line) => `- ${lineText(line)}`).join("\n"),
        );
      }
      if (input.duration !== job.duration) {
        const end = new Date(
          Date.parse(job.startTime) + input.duration * 60_000,
        ).toISOString();
        changes.push(
          `processing time ${formatDurationInput(job.duration)} → ${formatDurationInput(input.duration)} (ends ${end})`,
        );
      }
      if (input.cost !== job.cost) {
        changes.push(
          `cost ${job.cost ?? "none"} → ${input.cost ?? "none"} aUEC`,
        );
      }
      if (input.note !== job.note) {
        changes.push(`note → ${input.note ? `“${input.note}”` : "none"}`);
      }
      if (changes.length === 0) return toolError("Nothing to change.");
      if (job.content && job.lines.length === 0) {
        changes.push("its old free-text content is replaced by the lines");
      }

      const summary = `Change the refining order at ${job.location} (order ${job.id}): ${changes.join("; ")}.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let updated: RefiningJob;
      try {
        updated = await updateRefiningJob(user.id, job.id, input);
      } catch (error) {
        return refiningError(error, "Nothing was changed");
      }
      return toolResult(
        { status: "done", summary, job: toJob(updated, Date.now()) },
        `Done: ${summary}`,
      );
    },
  );

  server.registerTool(
    "collect_refining_job",
    {
      title: "Collect a refining order",
      description:
        "Collect a finished refining order: its materials become lots of the player's inventory (at the refinery unless another location is given; a matching lot there is topped up) and the order is removed. Inert materials are left out unless includeInert is set; pass lines when the actual yield differs. Asks the user to confirm first.",
      inputSchema: z.object({
        jobId: z.string().describe("Order id, from list_refining_jobs"),
        location: z
          .string()
          .optional()
          .describe(
            "Where to store the materials: location id, place slug or exact name; the refinery by default",
          ),
        lines: z
          .array(lineInput)
          .min(1)
          .max(40)
          .optional()
          .describe(
            "The materials actually collected, in cSCU; the order's own lines by default",
          ),
        includeInert: z
          .boolean()
          .optional()
          .describe("Also store inert materials (left out by default)"),
        unit: z
          .enum(["cSCU", "SCU"])
          .optional()
          .describe("Unit of the inventory lots (cSCU by default)"),
        shareWithOrg: z
          .boolean()
          .optional()
          .describe("Let the player's organizations see these lots"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        created: z.number(),
        merged: z.number(),
        location: z.string(),
        url: z.string(),
      }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: collectChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const stored = await getRefiningJob(user.id, args.jobId);
      if (!stored) return toolError(`No refining order ${args.jobId}.`);
      const job = normalize(stored);
      const now = Date.now();
      if (!isFinished(job, now)) {
        return toolError(
          `The order at ${job.location} is still processing: ${formatDurationInput(minutesLeft(job, now))} left (ends ${job.endTime}). Collect it once it is done, or remove it with delete_refining_job.`,
        );
      }

      const source = args.lines ?? job.lines;
      const leftOut = args.includeInert
        ? []
        : source.filter((line) => isInertMaterial(line.name));
      const lines = source.filter((line) => !leftOut.includes(line));
      if (lines.length === 0) {
        return toolError(
          source.length === 0
            ? `This older order has no material lines (“${job.content ?? ""}”): pass lines with what was collected, or remove it with delete_refining_job.`
            : "Only inert materials to collect: pass includeInert: true to store them, or remove the order with delete_refining_job.",
        );
      }

      let locationId = job.locationId;
      let locationName = job.location;
      if (args.location !== undefined) {
        const found = await locate(user.id, args.location);
        if (found.error) return found.error;
        locationId = found.location.id;
        locationName = found.location.name;
      }
      if (!locationId) {
        return toolError(
          `This older order only names its refinery as “${job.location}”: pass location (search_inventory_locations) to say where to store the materials.`,
        );
      }

      const unit = args.unit ?? "cSCU";
      const checked = checkCollectInput({
        lines,
        locationId,
        unit,
        orgVisible: args.shareWithOrg === true,
      });
      if (!checked.ok) {
        return toolError(`Nothing was collected: ${checked.error}.`);
      }

      const summary =
        `Collect the refining order at ${job.location} into ${user.name}'s inventory at ${locationName}` +
        (unit === "SCU" ? " (in SCU)" : "") +
        ":\n" +
        checked.value.lines.map((line) => `- ${lineText(line)}`).join("\n") +
        (leftOut.length
          ? `\nLeft out: ${leftOut.map((line) => line.name).join(", ")}`
          : "") +
        "\nThe order is then removed.";
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let result: { created: number; merged: number };
      try {
        result = await collectRefiningJob(user.id, job.id, checked.value);
      } catch (error) {
        return refiningError(error, "Nothing was collected");
      }
      return toolResult(
        {
          status: "done",
          summary,
          created: result.created,
          merged: result.merged,
          location: locationName,
          url: siteUrl("/inventory"),
        },
        `Done: ${result.created} new lots, ${result.merged} added to lots already at ${locationName}; the order is removed. See ${mdLink("the inventory", "/inventory")}.`,
      );
    },
  );

  server.registerTool(
    "delete_refining_job",
    {
      title: "Remove a refining order",
      description:
        "Remove one of the signed-in player's refining orders without adding anything to the inventory (a cancelled or mistaken order). To store its materials, use collect_refining_job instead. Asks the user to confirm first.",
      inputSchema: z.object({
        jobId: z.string().describe("Order id, from list_refining_jobs"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ removed: z.boolean() }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: deleteChallenge,
    },
    async ({ jobId, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const stored = await getRefiningJob(user.id, jobId);
      if (!stored) return toolError(`No refining order ${jobId}.`);
      const job = normalize(stored);

      const contents = job.lines.length
        ? job.lines.map((line) => line.name).join(", ")
        : job.content;
      const summary = `Remove the refining order at ${job.location}${contents ? ` (${contents})` : ""} without adding anything to the inventory.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      try {
        await deleteRefiningJob(user.id, jobId);
      } catch (error) {
        return refiningError(error, "Nothing was removed");
      }
      return toolResult(
        { status: "done", summary, removed: true },
        `Done: the order at ${job.location} is removed.`,
      );
    },
  );
}
