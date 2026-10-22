import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import en from "@/messages/en.json";
import {
  buildTimelineCreate,
  buildTimelineEdit,
} from "@/lib/contribution-catalog";
import { withOpenTimelineEdit } from "@/lib/contributions";
import { userHasPermission } from "@/lib/permissions";
import {
  countTimelineBugs,
  createTimelineBug,
  deleteTimelineBug,
  getTimelineEvent,
  getTimelineProgress,
  listTimelineBugs,
  listTimelineEvents,
  resolveTimelineRefs,
  saveTimelineProgress,
  setTimelineBugAffected,
  TimelineBugError,
  updateTimelineBug,
} from "@/lib/timeline-events";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";
import {
  MAX_TIMELINE_BUG_TEXT_LENGTH,
  MAX_TIMELINE_BUG_TITLE_LENGTH,
  MAX_TIMELINE_DESCRIPTION_LENGTH,
  MAX_TIMELINE_GUIDE_BODY_LENGTH,
  MAX_TIMELINE_GUIDE_SECTIONS,
  MAX_TIMELINE_GUIDE_TITLE_LENGTH,
  MAX_TIMELINE_MISSIONS,
  MAX_TIMELINE_NAME_LENGTH,
  MAX_TIMELINE_PATCH_LENGTH,
  MAX_TIMELINE_RELATED,
  MAX_TIMELINE_REWARDS_PER_TIER,
  MAX_TIMELINE_SHORT_TEXT,
  MAX_TIMELINE_SOURCES,
  MAX_TIMELINE_SUMMARY_LENGTH,
  MAX_TIMELINE_TIERS,
  MAX_TIMELINE_TRACKS,
  OFFICIAL_SOURCE_HOSTS,
  TIMELINE_ACCESS,
  TIMELINE_BUG_STATUSES,
  TIMELINE_BUGS_DAILY_CAP,
  TIMELINE_EVENT_TYPES,
  TIMELINE_SOURCE_KINDS,
  TIMELINE_SYSTEMS,
  countRewards,
  matchesTimelineSearch,
  timelineStatus,
  type TimelineBug,
  type TimelineEvent,
  type TimelineEventSummary,
  type TimelineStatus,
} from "@/types/timeline-events";
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
import {
  contribute,
  contributionOutput,
  metaParams,
  WRITE,
} from "./contributions";
import { placePath } from "./places";

/**
 * Les évènements officiels de Star Citizen (`/timeline`) : les lire et les
 * chercher sans compte, les proposer et les corriger en contributions (relues
 * comme sur le site, `lib/contribution-catalog.ts`), et ce que chaque joueur
 * pose sans relecture : les bugs (« je l'ai aussi ») et sa progression.
 *
 * Le retrait d'un évènement reste à la modération, sur le site.
 */

const createChallenge = personalTool(
  "contribute_official_event_create",
  "contributions:write",
);
const editChallenge = personalTool(
  "contribute_official_event_edit",
  "contributions:write",
);
// Un bug se publie sans relecture, mais c'est du contenu communautaire : la
// portée des contributions, comme sur la page de l'évènement.
const reportBugChallenge = personalTool(
  "report_official_event_bug",
  "contributions:write",
);
const updateBugChallenge = personalTool(
  "update_official_event_bug",
  "contributions:write",
);
const deleteBugChallenge = personalTool(
  "delete_official_event_bug",
  "contributions:write",
);
// La progression est au joueur seul, comme ses évènements et ses sessions.
const progressChallenge = personalTool(
  "save_official_event_progress",
  "events:write",
);

const TYPE_LABELS = en.Timeline.types as Record<string, string>;
const STATUS_LABELS = en.Timeline.status as Record<TimelineStatus, string>;
const BUG_STATUS_LABELS = en.Timeline.Bugs.statuses as Record<string, string>;

const timelinePath = (slug: string) => `/timeline/${slug}`;

const BUG_ERRORS: Record<TimelineBugError["code"], string> = {
  notFound: "No such official event or bug.",
  forbidden:
    "Only the player who reported this bug, or a moderator, can do that.",
  invalid: "Invalid bug",
  tooMany: `Daily limit reached: ${TIMELINE_BUGS_DAILY_CAP} bugs a day.`,
};

function bugErrorText(error: TimelineBugError): string {
  const message = BUG_ERRORS[error.code];
  return error.message !== error.code
    ? `${message}: ${error.message}`
    : message;
}

/** Un modérateur des contributions, celui qui peut aussi retirer un bug d'un autre. */
function isModerator(userId: string): Promise<boolean> {
  return userHasPermission(userId, CONTRIBUTIONS_REVIEW_PERMISSION);
}

// ─── Schémas ────────────────────────────────────────────────────────────────

const rewardSchema = z.object({
  itemSlug: z
    .string()
    .max(160)
    .optional()
    .describe("Slug of the catalog item (search_items): shown with its image"),
  name: z
    .string()
    .max(MAX_TIMELINE_NAME_LENGTH)
    .optional()
    .describe("Plain name, only when the item is not in the catalog"),
  note: z
    .string()
    .max(60)
    .optional()
    .describe("What it is in plain words: Paint, Flight blades…"),
});

const trackSchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "Id of an existing track (from get_official_event): keep it when editing, players' progress is saved by track id",
    ),
  name: z.string().min(1).max(60).describe("e.g. Transport, Total"),
  tiers: z
    .array(
      z.object({
        points: z.number().int().min(0),
        rewards: z.array(rewardSchema).max(MAX_TIMELINE_REWARDS_PER_TIER),
      }),
    )
    .max(MAX_TIMELINE_TIERS),
});

const missionSchema = z.object({
  missionId: z
    .string()
    .optional()
    .describe("Id of the mission entry (search_missions)"),
  name: z
    .string()
    .max(MAX_TIMELINE_NAME_LENGTH)
    .optional()
    .describe("Plain name, only when the mission is not in the catalog"),
  track: z
    .string()
    .max(60)
    .optional()
    .describe("Name of the track it scores in"),
  points: z.number().int().min(0).optional(),
  auec: z.number().int().min(0).optional().describe("Payout in aUEC"),
  conditions: z.string().max(MAX_TIMELINE_SHORT_TEXT).optional(),
});

const eventFields = {
  name: z.string().min(2).max(MAX_TIMELINE_NAME_LENGTH),
  type: z.enum(TIMELINE_EVENT_TYPES),
  systems: z.array(z.enum(TIMELINE_SYSTEMS)),
  placeSlug: z
    .string()
    .max(160)
    .describe("Slug of the main place (search_places), if any"),
  summary: z
    .string()
    .min(1)
    .max(MAX_TIMELINE_SUMMARY_LENGTH)
    .describe("One sentence for the cards and the timeline"),
  description: z
    .string()
    .max(MAX_TIMELINE_DESCRIPTION_LENGTH)
    .describe("Markdown"),
  access: z
    .enum(TIMELINE_ACCESS)
    .describe(
      "owners: game package holders; everyone: free to play (Free Fly); subscribers",
    ),
  permanentRewards: z
    .boolean()
    .describe("Rewards stay after a wipe (default true)"),
  startAt: z
    .string()
    .describe("Start, ISO 8601 in UTC; omit while unannounced"),
  endAt: z.string().describe("End, ISO 8601 in UTC"),
  endTimeUnknown: z
    .boolean()
    .describe("CIG only gave the end day, not the hour"),
  patch: z.string().max(MAX_TIMELINE_PATCH_LENGTH).describe("e.g. 4.10.2"),
  relatedSlugs: z
    .array(z.string())
    .max(MAX_TIMELINE_RELATED)
    .describe("Slugs of related official events (earlier editions…)"),
  banner: z
    .object({
      url: z
        .string()
        .describe(
          "Image of the official announcement, on media.robertsspaceindustries.com (uploads only from the site)",
        ),
      credit: z.string().max(MAX_TIMELINE_SHORT_TEXT).optional(),
    })
    .describe("Banner image"),
  sources: z
    .array(
      z.object({
        kind: z.enum(TIMELINE_SOURCE_KINDS),
        title: z.string().min(1).max(MAX_TIMELINE_SHORT_TEXT),
        url: z
          .string()
          .describe(
            `https link on an official host: ${OFFICIAL_SOURCE_HOSTS.join(", ")}`,
          ),
      }),
    )
    .min(1)
    .max(MAX_TIMELINE_SOURCES)
    .describe(
      "Official sources only (Comm-Link, Spectrum, patch notes, FAQ, CIG videos); players' guides go in the guide",
    ),
  tracks: z
    .array(trackSchema)
    .max(MAX_TIMELINE_TRACKS)
    .describe("Reward tracks and their tiers"),
  missions: z
    .array(missionSchema)
    .max(MAX_TIMELINE_MISSIONS)
    .describe("The event's contracts"),
};

const guideSectionSchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "Id of the section to rewrite (from get_official_event); omit to add a section",
    ),
  title: z.string().min(1).max(MAX_TIMELINE_GUIDE_TITLE_LENGTH),
  body: z.string().max(MAX_TIMELINE_GUIDE_BODY_LENGTH).describe("Markdown"),
});

const summarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  typeLabel: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  systems: z.array(z.string()),
  summary: z.string(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  endTimeUnknown: z.boolean().optional(),
  patch: z.string().optional(),
  guideSections: z.number(),
  rewardCount: z.number(),
  url: z.string(),
});

const bugSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  workaround: z.string().optional(),
  status: z.string(),
  statusLabel: z.string(),
  fixedIn: z.string().optional(),
  issueCouncilUrl: z.string().optional(),
  reportedBy: z.string().optional(),
  affected: z.number(),
  mine: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Mise en forme ──────────────────────────────────────────────────────────

function day(iso: string | undefined): string | undefined {
  return iso?.slice(0, 10);
}

/** Les dates comme la page les donne : « 2026-10-09 → 2026-10-20 (end time unknown) ». */
function dates(
  event: Pick<TimelineEvent, "startAt" | "endAt" | "endTimeUnknown">,
): string {
  if (!event.startAt) return "dates not announced";
  const start = event.startAt.slice(0, 16).replace("T", " ") + " UTC";
  if (!event.endAt) return `from ${start}, no end date`;
  const end = event.endTimeUnknown
    ? `${day(event.endAt)} (end time unknown)`
    : event.endAt.slice(0, 16).replace("T", " ") + " UTC";
  return `${start} → ${end}`;
}

function toSummary(event: TimelineEventSummary) {
  return {
    slug: event.slug,
    name: event.name,
    type: event.type,
    typeLabel: TYPE_LABELS[event.type] ?? event.type,
    status: event.status,
    statusLabel: STATUS_LABELS[event.status] ?? event.status,
    systems: event.systems,
    summary: event.summary,
    startAt: event.startAt,
    endAt: event.endAt,
    endTimeUnknown: event.endTimeUnknown,
    patch: event.patch,
    guideSections: event.guideSections,
    rewardCount: event.rewardCount,
    url: siteUrl(timelinePath(event.slug)),
  };
}

function toBug(bug: TimelineBug) {
  return {
    id: bug.id,
    title: bug.title,
    description: bug.description,
    workaround: bug.workaround,
    status: bug.status,
    statusLabel: BUG_STATUS_LABELS[bug.status] ?? bug.status,
    fixedIn: bug.fixedIn,
    issueCouncilUrl: bug.issueCouncilUrl,
    reportedBy: bug.userName,
    affected: bug.affected,
    mine: bug.mine,
    createdAt: bug.createdAt,
    updatedAt: bug.updatedAt,
  };
}

function bugLine(bug: ReturnType<typeof toBug>): string {
  return (
    `- **${bug.title}** (id: ${bug.id}) · ${bug.statusLabel}` +
    (bug.fixedIn ? `, fixed in ${bug.fixedIn}` : "") +
    ` · ${bug.affected} player(s) have it${bug.mine ? ", you included" : ""}` +
    (bug.description ? `\n  ${bug.description}` : "") +
    (bug.workaround ? `\n  Workaround: ${bug.workaround}` : "") +
    (bug.issueCouncilUrl ? `\n  Issue Council: ${bug.issueCouncilUrl}` : "")
  );
}

function revalidateEvent(slug: string) {
  revalidatePath(timelinePath(slug));
}

// ─── Outils ─────────────────────────────────────────────────────────────────

export function registerTimelineTools(server: McpServer) {
  server.registerTool(
    "search_official_events",
    {
      title: "Search official Star Citizen events",
      description:
        "The official in-game events CIG runs (dynamic events, conventions like CitizenCon or IAE, Free Fly, festivals, economy events), as on the /timeline page: live ones first, then upcoming and announced ones, then the history, newest first. Each has its dates, status (live, upcoming, announced, ended), patch, number of reward tiers and whether the community guide is written. Not the community or organization events (list_my_events). Then call get_official_event for the full page.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            "Words in the name, summary or patch, e.g. Discovery, 4.10",
          ),
        status: z
          .enum(["live", "upcoming", "announced", "ended"])
          .optional()
          .describe("Only this status"),
        type: z.enum(TIMELINE_EVENT_TYPES).optional(),
        system: z.enum(TIMELINE_SYSTEMS).optional(),
        withoutGuide: z
          .boolean()
          .optional()
          .describe("Only events whose community guide is still to write"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(PAGE_SIZE.max)
          .optional()
          .describe(`Maximum results (default ${PAGE_SIZE.default})`),
      }),
      outputSchema: z.object({
        total: z.number(),
        events: z.array(summarySchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, status, type, system, withoutGuide, limit }) => {
      const all = await listTimelineEvents();
      const matching = all.filter(
        (event) =>
          (!status || event.status === status) &&
          matchesTimelineSearch(event, {
            q: query,
            type,
            system,
            guide: withoutGuide ? "missing" : undefined,
          }),
      );
      // L'ordre du hub : en cours, puis à venir, puis l'historique.
      const rank: Record<TimelineStatus, number> = {
        live: 0,
        upcoming: 1,
        announced: 2,
        ended: 3,
      };
      const sorted = [...matching].sort((a, b) => {
        if (rank[a.status] !== rank[b.status]) {
          return rank[a.status] - rank[b.status];
        }
        if (a.status === "upcoming") {
          return (a.startAt ?? "").localeCompare(b.startAt ?? "");
        }
        return 0;
      });
      const events = sorted.slice(0, limit ?? PAGE_SIZE.default).map(toSummary);
      return toolResult(
        { total: matching.length, events, url: siteUrl("/timeline") },
        events.length === 0
          ? `No official event matches. ${mdLink("Official events", "/timeline")}`
          : `Official events (${events.length}${matching.length > events.length ? ` of ${matching.length}` : ""}):\n` +
              events
                .map(
                  (e) =>
                    `- ${mdLink(e.name, timelinePath(e.slug))} (slug: ${e.slug}) · ${e.statusLabel} · ${e.typeLabel}` +
                    `${e.patch ? ` · Alpha ${e.patch}` : ""} · ${dates(e)}` +
                    `${e.systems.length ? ` · ${e.systems.join(", ")}` : ""}` +
                    ` · ${e.rewardCount} rewards · ${e.guideSections > 0 ? `guide: ${e.guideSections} sections` : "no guide yet"}` +
                    `\n  ${e.summary}`,
                )
                .join("\n"),
      );
    },
  );

  server.registerTool(
    "get_official_event",
    {
      title: "Get an official Star Citizen event",
      description:
        "The full page of an official event by slug (search_official_events): dates and status, patch, systems and place, who can play it, official sources, reward tracks with their tiers (catalog items named and linked), contracts, related events, the community guide section by section (with the section ids that contribute_official_event_edit needs), and the number of known bugs (list_official_event_bugs). For a signed-in player, also their saved progress by track.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Slug of the official event"),
      }),
      outputSchema: z.looseObject({
        slug: z.string(),
        name: z.string(),
        status: z.string(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug }, ctx) => {
      const event = await getTimelineEvent(slug);
      if (!event) {
        return toolError(
          `No official event “${slug}”. Use search_official_events to find its slug.`,
        );
      }
      const readerId = optionalUserId(ctx, "events:read");
      const [refs, bugCount, progress] = await Promise.all([
        resolveTimelineRefs(event),
        countTimelineBugs(event.slug),
        readerId
          ? getTimelineProgress(new ObjectId(readerId), event.slug)
          : Promise.resolve(null),
      ]);
      const status = timelineStatus(event);
      const itemName = (itemSlug: string) =>
        refs.items[itemSlug]?.name ?? itemSlug;
      const tracks = event.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        tiers: track.tiers.map((tier) => ({
          points: tier.points,
          rewards: tier.rewards.map((reward) => ({
            ...reward,
            ...(reward.itemSlug
              ? {
                  name: itemName(reward.itemSlug),
                  url: siteUrl(`/items/${reward.itemSlug}`),
                }
              : {}),
          })),
        })),
        ...(progress ? { myPoints: progress.points[track.id] ?? 0 } : {}),
      }));
      const missions = event.missions.map((mission) => ({
        ...mission,
        ...(mission.missionId
          ? {
              name: refs.missions[mission.missionId] ?? mission.missionId,
              url: siteUrl(`/missions/${mission.missionId}`),
            }
          : {}),
      }));
      const related = (event.relatedSlugs ?? []).map((relatedSlug) => ({
        slug: relatedSlug,
        name: refs.related[relatedSlug]?.name ?? relatedSlug,
        status: refs.related[relatedSlug]?.status,
        url: siteUrl(timelinePath(relatedSlug)),
      }));
      const data = {
        slug: event.slug,
        name: event.name,
        type: event.type,
        typeLabel: TYPE_LABELS[event.type] ?? event.type,
        status,
        statusLabel: STATUS_LABELS[status],
        systems: event.systems,
        place: refs.place
          ? { ...refs.place, url: siteUrl(placePath(refs.place.slug)) }
          : undefined,
        summary: event.summary,
        description: event.description,
        access: event.access,
        permanentRewards: event.permanentRewards,
        startAt: event.startAt,
        endAt: event.endAt,
        endTimeUnknown: event.endTimeUnknown,
        patch: event.patch,
        banner: event.banner,
        sources: event.sources,
        tracks,
        rewardCount: countRewards(event.tracks),
        missions,
        related,
        guide: event.guide,
        guideUpdatedAt: event.guideUpdatedAt,
        bugCount,
        progress: progress ?? undefined,
        updatedAt: event.updatedAt,
        url: siteUrl(timelinePath(event.slug)),
        editUrl: siteUrl(`${timelinePath(event.slug)}/modifier`),
      };

      const lines = [
        `# ${event.name}`,
        `${STATUS_LABELS[status]} · ${data.typeLabel}${event.patch ? ` · Alpha ${event.patch}` : ""} · ${dates(event)}`,
        `${event.systems.length ? `Systems: ${event.systems.join(", ")}. ` : ""}${refs.place ? `Place: ${mdLink(refs.place.name, placePath(refs.place.slug))}. ` : ""}Access: ${event.access}. Rewards ${event.permanentRewards ? "are permanent" : "may not survive a wipe"}.`,
        "",
        event.summary,
        ...(event.description ? ["", event.description] : []),
        "",
        "## Official sources",
        ...event.sources.map((s) => `- [${s.title}](${s.url}) (${s.kind})`),
      ];
      if (tracks.length > 0) {
        lines.push("", "## Rewards");
        for (const track of tracks) {
          lines.push(
            `### ${track.name} (track id: ${track.id})${"myPoints" in track ? ` — your points: ${track.myPoints}` : ""}`,
          );
          for (const tier of track.tiers) {
            lines.push(
              `- ${tier.points} pts: ` +
                (tier.rewards
                  .map(
                    (r) =>
                      `${"url" in r && r.url ? `[${r.name}](${r.url})` : r.name}${r.note ? ` (${r.note})` : ""}`,
                  )
                  .join(", ") || "—"),
            );
          }
        }
      }
      if (missions.length > 0) {
        lines.push("", "## Contracts");
        for (const m of missions) {
          lines.push(
            `- ${"url" in m && m.url ? `[${m.name}](${m.url})` : m.name}` +
              [
                m.track ? `track ${m.track}` : "",
                m.points !== undefined ? `${m.points} pts` : "",
                m.auec !== undefined ? `${m.auec} aUEC` : "",
                m.conditions ?? "",
              ]
                .filter(Boolean)
                .map((part) => ` · ${part}`)
                .join(""),
          );
        }
      }
      if (related.length > 0) {
        lines.push(
          "",
          "Related: " +
            related.map((r) => mdLink(r.name, timelinePath(r.slug))).join(", "),
        );
      }
      lines.push("", "## Community guide");
      if (event.guide.length === 0) {
        lines.push(
          "Not written yet: contribute_official_event_edit can add the first sections.",
        );
      }
      for (const section of event.guide) {
        lines.push(
          `### ${section.title} (section id: ${section.id})`,
          section.body,
        );
      }
      lines.push(
        "",
        `${bugCount} known bug(s)${bugCount > 0 ? ": list_official_event_bugs" : ""}.`,
        mdLink(event.name, timelinePath(event.slug)),
      );
      return toolResult(data, lines.join("\n"));
    },
  );

  server.registerTool(
    "list_official_event_bugs",
    {
      title: "List the known bugs of an official event",
      description:
        "The bugs players reported during an official event, the most shared first: status (open, workaround, fixed and in which patch), the workaround, the Issue Council link and how many players have it. For a signed-in player, whether they marked it too.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Slug of the official event"),
      }),
      outputSchema: z.object({
        slug: z.string(),
        bugs: z.array(bugSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug }, ctx) => {
      const event = await getTimelineEvent(slug);
      if (!event) return toolError(`No official event “${slug}”.`);
      const readerId = optionalUserId(ctx, "profile");
      const bugs = (
        await listTimelineBugs(
          event.slug,
          readerId ? new ObjectId(readerId) : undefined,
        )
      ).map(toBug);
      return toolResult(
        { slug: event.slug, bugs, url: siteUrl(timelinePath(event.slug)) },
        bugs.length === 0
          ? `No bug reported for ${mdLink(event.name, timelinePath(event.slug))} yet.`
          : `Known bugs of ${mdLink(event.name, timelinePath(event.slug))}:\n` +
              bugs.map(bugLine).join("\n"),
      );
    },
  );

  server.registerTool(
    "contribute_official_event_create",
    {
      title: "Propose an official event",
      description:
        "Propose an official Star Citizen event missing from /timeline (search_official_events first: an event whose name gives the same address is refused as a duplicate). The address (slug) follows the name. At least one official source is required (RSI or CIG links only). Reward items and contracts point to catalog entries when they exist (search_items, search_missions). The guide is written afterwards with contribute_official_event_edit. Goes to community review unless the user is a trusted contributor (level 3 or more). Asks the user to confirm first.",
      inputSchema: z.object({
        event: z.object({
          ...eventFields,
          systems: eventFields.systems.optional(),
          placeSlug: eventFields.placeSlug.optional(),
          description: eventFields.description.optional(),
          access: eventFields.access.optional(),
          permanentRewards: eventFields.permanentRewards.optional(),
          startAt: eventFields.startAt.optional(),
          endAt: eventFields.endAt.optional(),
          endTimeUnknown: eventFields.endTimeUnknown.optional(),
          patch: eventFields.patch.optional(),
          relatedSlugs: eventFields.relatedSlugs.optional(),
          banner: eventFields.banner.optional(),
          tracks: eventFields.tracks.optional(),
          missions: eventFields.missions.optional(),
        }),
        ...metaParams,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: createChallenge,
    },
    async ({ event, source, gameVersion, confirm }, ctx) =>
      contribute(
        ctx,
        () => buildTimelineCreate(event),
        { kind: "timelineCreate", input: event },
        { source, gameVersion },
        confirm,
      ),
  );

  server.registerTool(
    "contribute_official_event_edit",
    {
      title: "Correct an official event or its guide",
      description:
        "Propose changes to an official event (get_official_event shows the current page): `changes` holds only the fields to change, each replacing the whole value (send the full tracks, missions or sources list, keeping track ids); renaming needs contributor level 4. `guide` adds sections (no id) or rewrites them (with their section id); `guideRemoved` removes sections by id. The guide covers what the official pages do not: how to earn points fast, routes, pitfalls, tips. A correction still awaiting review from the same player is completed, not replaced. Goes to community review unless the user is a trusted contributor (level 3 or more). Asks the user to confirm first.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Slug of the official event"),
        changes: z
          .object(eventFields)
          .partial()
          .optional()
          .describe("Only the fields to change"),
        guide: z
          .array(guideSectionSchema)
          .max(MAX_TIMELINE_GUIDE_SECTIONS)
          .optional()
          .describe("Guide sections to add or rewrite"),
        guideRemoved: z
          .array(z.string())
          .max(MAX_TIMELINE_GUIDE_SECTIONS)
          .optional()
          .describe("Ids of guide sections to remove"),
        ...metaParams,
        confirm: confirmParam,
      }),
      outputSchema: contributionOutput,
      annotations: WRITE,
      scopeChallenge: editChallenge,
    },
    async (
      { slug, changes, guide, guideRemoved, source, gameVersion, confirm },
      ctx,
    ) => {
      const input = {
        ...(changes ?? {}),
        ...(guide ? { guide } : {}),
        ...(guideRemoved ? { guideRemoved } : {}),
      };
      if (
        Object.keys(changes ?? {}).length === 0 &&
        !guide?.length &&
        !guideRemoved?.length
      ) {
        return toolError("Give changes, guide sections, or both.");
      }
      const user = await currentUser(ctx);
      const meta = { source, gameVersion };
      return contribute(
        ctx,
        // Ce que le site enverra : la proposition ouverte du joueur, complétée.
        async (level) =>
          buildTimelineEdit(
            slug,
            await withOpenTimelineEdit(
              new ObjectId(user.id),
              slug,
              input,
              meta,
            ),
            level,
          ),
        { kind: "timelineEdit", slug, input },
        meta,
        confirm,
      );
    },
  );

  server.registerTool(
    "report_official_event_bug",
    {
      title: "Report a bug of an official event",
      description:
        "Report a bug met during an official event (list_official_event_bugs first: if it is already there, mark it with update_official_event_bug and affected: true instead). Published right away, without review; the reporter counts as having it. Asks the user to confirm first.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Slug of the official event"),
        title: z
          .string()
          .min(1)
          .max(MAX_TIMELINE_BUG_TITLE_LENGTH)
          .describe("The problem, in one line"),
        description: z
          .string()
          .max(MAX_TIMELINE_BUG_TEXT_LENGTH)
          .optional()
          .describe("What happens, and when"),
        workaround: z.string().max(MAX_TIMELINE_BUG_TEXT_LENGTH).optional(),
        status: z.enum(TIMELINE_BUG_STATUSES).optional(),
        fixedIn: z.string().max(MAX_TIMELINE_PATCH_LENGTH).optional(),
        issueCouncilUrl: z
          .string()
          .optional()
          .describe(
            "Link to the Issue Council report (robertsspaceindustries.com)",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ bug: bugSchema, url: z.string() }),
      annotations: WRITE,
      scopeChallenge: reportBugChallenge,
    },
    async ({ slug, confirm, ...input }, ctx) => {
      const user = await currentUser(ctx);
      const event = await getTimelineEvent(slug);
      if (!event) return toolError(`No official event “${slug}”.`);
      const summary =
        `Report, as ${user.name}, on “${event.name}”: “${input.title}”` +
        (input.status ? ` (${BUG_STATUS_LABELS[input.status]})` : "") +
        "." +
        (input.description ? `\n${input.description}` : "") +
        (input.workaround ? `\nWorkaround: ${input.workaround}` : "") +
        "\nPublished right away on the event page.";
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        const bug = toBug(
          await createTimelineBug(
            event.slug,
            { id: new ObjectId(user.id), name: user.name },
            input,
          ),
        );
        revalidateEvent(event.slug);
        return toolResult(
          {
            status: "done",
            summary,
            bug,
            url: siteUrl(timelinePath(event.slug)),
          },
          `Reported on ${mdLink(event.name, timelinePath(event.slug))} (bug id: ${bug.id}).`,
        );
      } catch (error) {
        if (error instanceof TimelineBugError) {
          return toolError(`Not sent: ${bugErrorText(error)}`);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "update_official_event_bug",
    {
      title: "Update a bug of an official event",
      description:
        "`affected`: mark (true) or unmark (false) a known bug as met by the player too, the “Me too” button, open to every player. Otherwise, the bug's fields to change (status, workaround, patch that fixed it…), only by the player who reported it or a moderator. Asks the user to confirm first.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Slug of the official event"),
        bugId: z
          .string()
          .min(1)
          .describe("Bug id from list_official_event_bugs"),
        affected: z.boolean().optional(),
        changes: z
          .object({
            title: z.string().min(1).max(MAX_TIMELINE_BUG_TITLE_LENGTH),
            description: z.string().max(MAX_TIMELINE_BUG_TEXT_LENGTH),
            workaround: z.string().max(MAX_TIMELINE_BUG_TEXT_LENGTH),
            status: z.enum(TIMELINE_BUG_STATUSES),
            fixedIn: z.string().max(MAX_TIMELINE_PATCH_LENGTH),
            issueCouncilUrl: z.string(),
          })
          .partial()
          .optional()
          .describe(
            "Only the fields to change; an empty text clears the field",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ bug: bugSchema, url: z.string() }),
      annotations: { ...WRITE, idempotentHint: true },
      scopeChallenge: updateBugChallenge,
    },
    async ({ slug, bugId, affected, changes, confirm }, ctx) => {
      if (affected === undefined && !Object.keys(changes ?? {}).length) {
        return toolError("Give affected, or the changes to make.");
      }
      if (affected !== undefined && changes && Object.keys(changes).length) {
        return toolError("Give affected or changes, not both in one call.");
      }
      const user = await currentUser(ctx);
      const userId = new ObjectId(user.id);
      const event = await getTimelineEvent(slug);
      if (!event) return toolError(`No official event “${slug}”.`);
      const bug = (await listTimelineBugs(event.slug, userId)).find(
        (b) => b.id === bugId,
      );
      if (!bug) return toolError(BUG_ERRORS.notFound);

      const moderator = affected === undefined && (await isModerator(user.id));
      let summary: string;
      if (affected !== undefined) {
        summary = affected
          ? `Mark, as ${user.name}, the bug “${bug.title}” of “${event.name}” as met too (${bug.affected} player(s) so far).`
          : `Remove ${user.name}'s “me too” from the bug “${bug.title}” of “${event.name}”.`;
      } else {
        if (!moderator && bug.userId !== user.id) {
          return toolError(BUG_ERRORS.forbidden);
        }
        summary =
          `Update the bug “${bug.title}” of “${event.name}”${moderator && bug.userId !== user.id ? " as a moderator" : ""}:\n` +
          Object.entries(changes ?? {})
            .map(
              ([field, value]) =>
                `- ${field}: ${(bug as Record<string, unknown>)[field] ?? "(empty)"} → ${value || "(empty)"}`,
            )
            .join("\n");
      }
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        const updated = toBug(
          affected !== undefined
            ? await setTimelineBugAffected(event.slug, bugId, userId, affected)
            : await updateTimelineBug(
                event.slug,
                bugId,
                { id: userId, moderator },
                changes,
              ),
        );
        revalidateEvent(event.slug);
        return toolResult(
          {
            status: "done",
            summary,
            bug: updated,
            url: siteUrl(timelinePath(event.slug)),
          },
          `Done: ${bugLine(updated)}`,
        );
      } catch (error) {
        if (error instanceof TimelineBugError) {
          return toolError(`Not changed: ${bugErrorText(error)}`);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "delete_official_event_bug",
    {
      title: "Delete a bug of an official event",
      description:
        "Delete a bug report from an official event page, by the player who reported it or a moderator (a duplicate, a mistake). Asks the user to confirm first.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Slug of the official event"),
        bugId: z
          .string()
          .min(1)
          .describe("Bug id from list_official_event_bugs"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ url: z.string() }),
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
      scopeChallenge: deleteBugChallenge,
    },
    async ({ slug, bugId, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const bug = (await listTimelineBugs(slug)).find((b) => b.id === bugId);
      if (!bug) return toolError(BUG_ERRORS.notFound);
      const moderator = await isModerator(user.id);
      if (!moderator && bug.userId !== user.id) {
        return toolError(BUG_ERRORS.forbidden);
      }
      const summary = `Delete the bug “${bug.title}” (${bug.affected} player(s) have it)${bug.userId !== user.id ? `, reported by ${bug.userName ?? "another player"}` : ""}. This cannot be undone.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        await deleteTimelineBug(slug, bugId, {
          id: new ObjectId(user.id),
          moderator,
        });
        revalidateEvent(slug);
        return toolResult(
          { status: "done", summary, url: siteUrl(timelinePath(slug)) },
          `Deleted the bug “${bug.title}”.`,
        );
      } catch (error) {
        if (error instanceof TimelineBugError) {
          return toolError(`Not deleted: ${bugErrorText(error)}`);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "save_official_event_progress",
    {
      title: "Save my progress in an official event",
      description:
        "Save the signed-in player's points in the reward tracks of an official event, as copied from their mobiGlas: `points` maps a track id or name (get_official_event) to the points reached. Tracks left out are cleared. get_official_event then shows the progress and the next tiers. Asks the user to confirm first.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Slug of the official event"),
        points: z
          .record(z.string(), z.number().int().min(0))
          .describe('Points by track id or name, e.g. {"Transport": 1200}'),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        points: z.record(z.string(), z.number()),
        url: z.string(),
      }),
      annotations: { ...WRITE, idempotentHint: true },
      scopeChallenge: progressChallenge,
    },
    async ({ slug, points, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const event = await getTimelineEvent(slug);
      if (!event) return toolError(`No official event “${slug}”.`);
      if (event.tracks.length === 0) {
        return toolError(`“${event.name}” has no reward track to follow.`);
      }
      const byId: Record<string, number> = {};
      const unknown: string[] = [];
      for (const [key, value] of Object.entries(points)) {
        const track =
          event.tracks.find((t) => t.id === key) ??
          event.tracks.find(
            (t) => t.name.trim().toLowerCase() === key.trim().toLowerCase(),
          );
        if (track) byId[track.id] = value;
        else unknown.push(key);
      }
      if (unknown.length > 0) {
        return toolError(
          `Unknown track(s): ${unknown.join(", ")}. Tracks of “${event.name}”: ${event.tracks.map((t) => `${t.name} (id: ${t.id})`).join(", ")}.`,
        );
      }
      const summary =
        `Save ${user.name}'s progress in “${event.name}”:\n` +
        event.tracks
          .map((t) => `- ${t.name}: ${byId[t.id] ?? 0} pts`)
          .join("\n");
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;
      const saved = await saveTimelineProgress(
        new ObjectId(user.id),
        event.slug,
        byId,
      );
      if (!saved) return toolError(`No official event “${slug}”.`);
      const next = event.tracks
        .map((t) => {
          const mine = saved.points[t.id] ?? 0;
          const tier = t.tiers.find((tier) => tier.points > mine);
          return tier
            ? `- ${t.name}: next tier at ${tier.points} pts (${tier.points - mine} to go)`
            : `- ${t.name}: every tier reached`;
        })
        .join("\n");
      return toolResult(
        {
          status: "done",
          summary,
          points: saved.points,
          url: siteUrl(timelinePath(event.slug)),
        },
        `Progress saved on ${mdLink(event.name, timelinePath(event.slug))}.\n${next}`,
      );
    },
  );
}
