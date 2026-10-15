import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  deleteOrgEvent,
  eventsByIds,
  getEventSquad,
  getOrgEventSummary,
  getOrgEventView,
  listCommunityEvents,
  listMyUpcomingEvents,
  parseOrgEventInput,
  parseRegistrationInput,
  registerToOrgEvent,
  updateOrgEvent,
  createOrgEvent,
  withdrawFromOrgEvent,
  type ParsedOrgEventInput,
} from "@/lib/org-events";
import { organizations } from "@/lib/orgs";
import { getPlaceBySlug } from "@/lib/places";
import {
  cancelPlannedSession,
  declarePlaying,
  getMyPresence,
  normalizeActivity,
  planSession,
  stopPlaying,
} from "@/lib/presence";
import {
  ORG_EVENT_ANSWER_MAX_LENGTH,
  ORG_EVENT_DESCRIPTION_MAX_LENGTH,
  ORG_EVENT_MAX_DURATION_HOURS,
  ORG_EVENT_MAX_QUESTIONS,
  ORG_EVENT_MAX_REGISTRATIONS,
  ORG_EVENT_MAX_ROLES,
  ORG_EVENT_MEETING_POINT_MAX_LENGTH,
  ORG_EVENT_QUESTION_MAX_LENGTH,
  ORG_EVENT_ROLE_LABEL_MAX_LENGTH,
  ORG_EVENT_TITLE_MAX_LENGTH,
  PERSONAL_EVENT_MAX_UPCOMING,
  eventHref,
  type CommunityEventView,
  type OrgEventView,
} from "@/types/org-events";
import {
  PLANNED_SESSION_GRACE_HOURS,
  PLANNED_SESSION_MAX_DAYS_AHEAD,
  PRESENCE_ACTIVITY_MAX_LENGTH,
  PRESENCE_TTL_HOURS,
  type MyPresence,
} from "@/types/presence";
import { SQUAD_ROLE_ICONS } from "@/types/squad";
import { currentUser, personalTool, type McpUser } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";
import { placePath } from "./places";

/**
 * Les évènements et la présence du joueur : les mêmes fonctions que les pages
 * `/events`, `/orgs/:orgId/events` et le profil (`lib/org-events.ts`,
 * `lib/presence.ts`), avec les mêmes contrôles d'accès et de saisie. Un
 * évènement personnel (`orgId` `null`) ne se gère que par son créateur ; un
 * évènement d'organisation, par son créateur ou un éditeur de l'orga.
 */

const EVENTS_PATH = "/events";
const PROFILE_PATH = "/profile";

const listChallenge = personalTool("list_my_events", "events:read");
const getChallenge = personalTool("get_event", "events:read");
const registerChallenge = personalTool("register_event", "events:write");
const withdrawChallenge = personalTool("withdraw_event", "events:write");
const createChallenge = personalTool("create_event", "events:write");
const updateChallenge = personalTool("update_event", "events:write");
const deleteChallenge = personalTool("delete_event", "events:write");
const planChallenge = personalTool("plan_session", "events:write");
const cancelPlanChallenge = personalTool(
  "cancel_planned_session",
  "events:write",
);
const playingChallenge = personalTool("set_playing", "events:write");

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

// ─── Schémas ──────────────────────────────────────────────────────────────────

const orgSchema = z.object({ id: z.string(), name: z.string() });

const eventEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  organization: orgSchema.optional(),
  personal: z.boolean(),
  organizer: z.string(),
  visibility: z.enum(["private", "public"]),
  meetingPoint: z.string().optional(),
  registrationCount: z.number(),
  registered: z.boolean(),
  myRole: z.string().optional(),
  guest: z.enum(["invite", "link"]).optional(),
  invitedBy: z.string().optional(),
  canRegister: z.boolean(),
  canManage: z.boolean(),
  url: z.string(),
});

const plannedSchema = z.object({
  at: z.string(),
  activity: z.string().optional(),
  event: z
    .object({ id: z.string(), title: z.string(), url: z.string() })
    .optional(),
});

const presenceSchema = z.object({
  playing: z.boolean(),
  activity: z.string().optional(),
  since: z.string().optional(),
  expiresAt: z.string().optional(),
  planned: plannedSchema.optional(),
  url: z.string(),
});

const roleSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  wanted: z.number().optional(),
  registered: z.number(),
});

const questionSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean(),
});

const answerSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.string(),
});

const eventDetailSchema = eventEntrySchema.extend({
  description: z.string(),
  durationMinutes: z.number(),
  meetingPlace: z
    .object({ slug: z.string(), name: z.string(), url: z.string() })
    .optional(),
  roles: z.array(roleSchema),
  questions: z.array(questionSchema),
  participants: z.array(
    z.object({
      name: z.string(),
      role: z.string().optional(),
      answers: z.array(answerSchema).optional(),
    }),
  ),
  withdrawnCount: z.number().optional(),
  myRegistration: z
    .object({
      active: z.boolean(),
      role: z.string().optional(),
      roleId: z.string().optional(),
      answers: z.array(answerSchema),
      registeredAt: z.string(),
    })
    .optional(),
  squad: z
    .object({
      exists: z.boolean(),
      name: z.string().optional(),
      code: z.string().optional(),
    })
    .optional(),
  over: z.boolean(),
});

type EventEntry = z.infer<typeof eventEntrySchema>;
type EventDetail = z.infer<typeof eventDetailSchema>;

// ─── Entrées ──────────────────────────────────────────────────────────────────

const eventIdInput = z
  .string()
  .describe("Event id, from list_my_events (or an event page URL's last part)");

const isoDate = (what: string) =>
  z
    .string()
    .describe(
      `${what}, ISO 8601 with a time zone offset, e.g. 2026-10-20T20:00:00+02:00`,
    );

const roleInput = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "The role's current id (get_event), to keep the registrations that picked it; omit for a new role",
    ),
  label: z.string().min(1).max(ORG_EVENT_ROLE_LABEL_MAX_LENGTH),
  icon: z.enum(SQUAD_ROLE_ICONS).describe("Role glyph, as on squad roles"),
  wanted: z
    .number()
    .int()
    .min(1)
    .max(ORG_EVENT_MAX_REGISTRATIONS)
    .nullable()
    .optional()
    .describe("How many the organizer wants (a target, not a cap)"),
});

const questionInput = z.object({
  id: z
    .string()
    .optional()
    .describe(
      "The question's current id (get_event), to keep its answers; omit for a new question",
    ),
  label: z.string().min(1).max(ORG_EVENT_QUESTION_MAX_LENGTH),
  required: z.boolean().optional(),
});

const answerInput = z.object({
  question: z.string().describe("Question id (get_event) or its exact wording"),
  answer: z
    .string()
    .max(ORG_EVENT_ANSWER_MAX_LENGTH)
    .describe("The answer; empty clears it"),
});

const activityInput = z
  .string()
  .max(PRESENCE_ACTIVITY_MAX_LENGTH)
  .nullable()
  .optional();

// ─── Mise en forme ────────────────────────────────────────────────────────────

function roleLabel(view: OrgEventView, roleId: string): string | undefined {
  return view.roles.find((role) => role.id === roleId)?.label;
}

function isRegistered(view: OrgEventView): boolean {
  return !!view.myRegistration && !view.myRegistration.withdrawn;
}

function toEntry(
  view: OrgEventView,
  org: { id: string; name: string } | null,
  invitedBy?: string,
): EventEntry {
  const registered = isRegistered(view);
  return {
    id: view.id,
    title: view.title,
    startsAt: view.startsAt,
    endsAt: view.endsAt,
    organization: org ? { id: org.id, name: org.name } : undefined,
    personal: view.orgId === null,
    organizer: view.createdBy.name,
    visibility: view.visibility,
    meetingPoint: view.meetingPoint || view.meetingPlace?.name || undefined,
    registrationCount: view.registrationCount,
    registered,
    myRole:
      registered && view.myRegistration
        ? roleLabel(view, view.myRegistration.role)
        : undefined,
    guest: view.guest ?? undefined,
    invitedBy,
    canRegister: view.canRegister,
    canManage: view.canManage,
    url: siteUrl(eventHref(view)),
  };
}

function entryLine(entry: EventEntry): string {
  const where = entry.organization
    ? entry.organization.name
    : entry.guest
      ? `personal event of ${entry.organizer}`
      : "personal event";
  const state = entry.registered
    ? `registered${entry.myRole ? ` as ${entry.myRole}` : ""}`
    : entry.canRegister
      ? "not registered"
      : "registration closed to you";
  return (
    `- ${mdLink(entry.title, new URL(entry.url).pathname)} (event: ${entry.id}) — ${entry.startsAt} → ${entry.endsAt} — ${where}` +
    (entry.meetingPoint ? ` — at ${entry.meetingPoint}` : "") +
    ` — ${entry.registrationCount} registered, ${state}` +
    (entry.invitedBy ? ` — invited by ${entry.invitedBy}` : "") +
    (entry.canManage ? " — you manage it" : "")
  );
}

function answersOf(
  view: OrgEventView,
  answers: Record<string, string>,
): z.infer<typeof answerSchema>[] {
  return view.questions.flatMap((question) =>
    answers[question.id]
      ? [
          {
            questionId: question.id,
            question: question.label,
            answer: answers[question.id],
          },
        ]
      : [],
  );
}

function toPresence(presence: MyPresence): z.infer<typeof presenceSchema> {
  const planned = presence.planned;
  return {
    playing: presence.playing,
    activity: presence.activity ?? undefined,
    since: presence.since ?? undefined,
    expiresAt: presence.expiresAt ?? undefined,
    planned: planned
      ? {
          at: planned.at,
          activity: planned.activity ?? undefined,
          event: planned.event
            ? {
                id: planned.event.eventId,
                title: planned.event.title,
                url: siteUrl(
                  eventHref({
                    orgId: planned.event.orgId,
                    id: planned.event.eventId,
                  }),
                ),
              }
            : undefined,
        }
      : undefined,
    url: siteUrl(PROFILE_PATH),
  };
}

function presenceText(presence: z.infer<typeof presenceSchema>): string {
  const now = presence.playing
    ? `In game${presence.activity ? ` (${presence.activity})` : ""} since ${presence.since}, until ${presence.expiresAt} unless renewed.`
    : "Not in game.";
  const planned = presence.planned
    ? ` Next session planned at ${presence.planned.at}${presence.planned.activity ? ` (${presence.planned.activity})` : ""}${presence.planned.event ? ` for the event “${presence.planned.event.title}” (event: ${presence.planned.event.id})` : ""}.`
    : " No session planned.";
  return now + planned;
}

// ─── Lectures communes ────────────────────────────────────────────────────────

/** Les organisations du joueur, pour désigner celle d'un évènement. */
async function myOrganizations(userId: string) {
  const orgs = await organizations()
    .find(
      { "members.userId": new ObjectId(userId) },
      { projection: { name: 1, tag: 1 } },
    )
    .sort({ name: 1 })
    .toArray();
  return orgs.map((org) => ({
    id: org._id,
    name: org.name,
    tag: org.tag ?? "",
  }));
}

function matchOrg<T extends { id: string; name: string; tag: string }>(
  orgs: T[],
  wanted: string,
): T | undefined {
  const key = wanted.trim().toLocaleLowerCase();
  return (
    orgs.find((org) => org.id === wanted.trim()) ??
    orgs.find(
      (org) =>
        org.name.toLocaleLowerCase() === key ||
        (!!org.tag && org.tag.toLocaleLowerCase() === key),
    )
  );
}

async function orgNameOf(orgId: string | null): Promise<string> {
  if (orgId === null) return "";
  const org = await organizations().findOne(
    { _id: orgId },
    { projection: { name: 1 } },
  );
  return org?.name ?? "";
}

/**
 * L'évènement tel que le joueur le voit sur sa fiche, ou une erreur. Un
 * évènement qu'il ne peut pas lire répond comme un évènement absent, comme
 * le site.
 */
async function loadEvent(
  userId: string,
  eventId: string,
): Promise<
  | { view: OrgEventView; org: { id: string; name: string } | null }
  | { error: ReturnType<typeof toolError> }
> {
  const missing = { error: toolError(`No event ${eventId} visible to you.`) };
  if (!ObjectId.isValid(eventId)) return missing;
  const [doc] = await eventsByIds([eventId]);
  if (!doc) return missing;
  const view = await getOrgEventView(doc.orgId, eventId, userId);
  if (!view) return missing;
  const org =
    view.orgId === null
      ? null
      : { id: view.orgId, name: await orgNameOf(view.orgId) };
  return { view, org };
}

function refusalText(
  refusal:
    | "not-found"
    | "forbidden"
    | "unknown-place"
    | "closed"
    | "full"
    | "too-many",
  forbidden: string,
): string {
  switch (refusal) {
    case "not-found":
      return "this event does not exist or is not visible to you";
    case "forbidden":
      return forbidden;
    case "unknown-place":
      return "meetingPlace names no known place (find its slug with search_places)";
    case "closed":
      return "the event is over: registrations can no longer change";
    case "full":
      return "the event has no room left";
    case "too-many":
      return `you already have ${PERSONAL_EVENT_MAX_UPCOMING} upcoming personal events`;
  }
}

const MANAGE_FORBIDDEN =
  "only the event's creator or an editor of its organization can do that";

function author(user: McpUser) {
  return { userId: user.id, name: user.name || "Sans nom" };
}

function minutesBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
}

/** L'heure de fin : donnée, ou le début plus la durée. */
function endOf(
  startsAt: string,
  endsAt: string | undefined,
  durationMinutes: number | undefined,
): string | undefined {
  if (endsAt !== undefined) return endsAt;
  if (durationMinutes === undefined) return undefined;
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return startsAt;
  return new Date(start + durationMinutes * 60_000).toISOString();
}

function eventInputText(input: ParsedOrgEventInput, placeName?: string) {
  const lines = [
    `“${input.title}”, ${input.startsAt} → ${input.endsAt}`,
    input.meetingPoint || placeName
      ? `Meeting point: ${[input.meetingPoint, placeName].filter(Boolean).join(" — ")}`
      : undefined,
    input.roles.length
      ? `Roles: ${input.roles.map((role) => `${role.label}${role.wanted ? ` (${role.wanted} wanted)` : ""}`).join(", ")}`
      : undefined,
    input.questions.length
      ? `Questions: ${input.questions.map((question) => `“${question.label}”${question.required ? " (required)" : ""}`).join(", ")}`
      : undefined,
    input.description
      ? `Description: ${input.description.length > 300 ? `${input.description.slice(0, 300)}…` : input.description}`
      : undefined,
  ];
  return lines.filter(Boolean).join("\n");
}

async function placeName(slug: string | null) {
  if (!slug) return { name: undefined };
  const place = await getPlaceBySlug(slug);
  if (!place) return { error: true as const };
  return { name: place.name };
}

export function registerEventTools(server: McpServer) {
  server.registerTool(
    "list_my_events",
    {
      title: "List my events",
      description:
        "List the upcoming events the signed-in player sees on Nexus Tools: those of their organizations, their personal events, the ones other players invited them to, and those they registered to, soonest first, with their registration status. Set includePublic to add other organizations' public events (the community calendar). Covers from a day ago to three months ahead. Also gives the player's in-game status and planned session. Event ids are what the other event tools take.",
      inputSchema: z.object({
        from: isoDate(
          "Only events still running at this date (now by default)",
        ).optional(),
        to: isoDate("Only events starting before this date").optional(),
        organization: z
          .string()
          .optional()
          .describe(
            'Only this organization\'s events: its id, name or tag; "personal" for personal events only',
          ),
        registeredOnly: z
          .boolean()
          .optional()
          .describe("Only the events the player is registered to"),
        includePublic: z
          .boolean()
          .optional()
          .describe("Also list other organizations' public events"),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        events: z.array(eventEntrySchema),
        myOrganizations: z.array(orgSchema),
        presence: presenceSchema,
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const from = args.from !== undefined ? Date.parse(args.from) : Date.now();
      const to = args.to !== undefined ? Date.parse(args.to) : Infinity;
      if (Number.isNaN(from) || Number.isNaN(to)) {
        return toolError("from and to must be ISO dates.");
      }

      const [calendar, presence] = await Promise.all([
        listCommunityEvents(user.id),
        getMyPresence(new ObjectId(user.id)),
      ]);
      const myOrgs = calendar.myOrgs.map((org) => ({
        id: org.id,
        name: org.name,
        tag: org.tag,
      }));

      let orgFilter: string | null | undefined;
      if (args.organization !== undefined) {
        if (args.organization.trim().toLocaleLowerCase() === "personal") {
          orgFilter = null;
        } else {
          // Les siennes d'abord, puis celles des évènements qu'il voit.
          const known = [
            ...myOrgs,
            ...calendar.events.flatMap((event) =>
              event.org
                ? [
                    {
                      id: event.org.id,
                      name: event.org.name,
                      tag: event.org.tag,
                    },
                  ]
                : [],
            ),
          ];
          const org = matchOrg(known, args.organization);
          if (!org) {
            return toolError(
              `No organization “${args.organization}” among the events you see.` +
                (myOrgs.length
                  ? ` Your organizations: ${myOrgs.map((one) => `${one.name} (${one.id})`).join(", ")}.`
                  : ""),
            );
          }
          orgFilter = org.id;
        }
      }

      const seen = (event: CommunityEventView) =>
        event.org === null ||
        event.org.isMember ||
        !!event.guest ||
        isRegistered(event);
      const all = calendar.events
        .filter((event) => args.includePublic || seen(event))
        .filter(
          (event) =>
            Date.parse(event.endsAt) > from && Date.parse(event.startsAt) < to,
        )
        .filter((event) =>
          orgFilter === undefined ? true : event.orgId === orgFilter,
        )
        .filter((event) => !args.registeredOnly || isRegistered(event));
      const events = all
        .slice(0, args.limit ?? 25)
        .map((event) =>
          toEntry(
            event,
            event.org ? { id: event.org.id, name: event.org.name } : null,
            event.invitedByName,
          ),
        );
      const shown = toPresence(presence);

      return toolResult(
        {
          total: all.length,
          events,
          myOrganizations: myOrgs.map(({ id, name }) => ({ id, name })),
          presence: shown,
          url: siteUrl(EVENTS_PATH),
        },
        (events.length
          ? `${all.length} events in ${mdLink("the events calendar", EVENTS_PATH)}` +
            (events.length < all.length ? ` (first ${events.length})` : "") +
            ":\n" +
            events.map(entryLine).join("\n")
          : `No upcoming event matches in ${mdLink("the events calendar", EVENTS_PATH)}.`) +
          `\n\n${presenceText(shown)}`,
      );
    },
  );

  server.registerTool(
    "get_event",
    {
      title: "Read an event",
      description:
        "Read an event the signed-in player can see (organization or personal event): description, dates, meeting point, roles with how many registered and wanted, registration questions, the registered players (with their answers when the player manages the event), the linked squad and the player's own registration. Event ids come from list_my_events.",
      inputSchema: z.object({ eventId: eventIdInput }),
      outputSchema: z.object({ event: eventDetailSchema }),
      annotations: READ_ONLY,
      scopeChallenge: getChallenge,
    },
    async ({ eventId }, ctx) => {
      const user = await currentUser(ctx);
      const found = await loadEvent(user.id, eventId);
      if ("error" in found) return found.error;
      const { view, org } = found;

      // L'organisateur lit aussi les réponses et l'escouade, comme sur la page
      // de résumé.
      const [summary, squad] = view.canManage
        ? await Promise.all([
            getOrgEventSummary(view.orgId, view.id, user.id),
            getEventSquad(view.squadId),
          ])
        : [null, null];
      const registrations =
        summary && "summary" in summary ? summary.summary : null;

      const mine = view.myRegistration;
      const detail: EventDetail = {
        ...toEntry(view, org),
        description: view.description,
        durationMinutes: minutesBetween(view.startsAt, view.endsAt),
        meetingPlace: view.meetingPlace
          ? {
              ...view.meetingPlace,
              url: siteUrl(placePath(view.meetingPlace.slug)),
            }
          : undefined,
        roles: view.roles.map((role) => ({
          id: role.id,
          label: role.label,
          icon: role.icon,
          wanted: role.wanted ?? undefined,
          registered: view.roleCounts[role.id] ?? 0,
        })),
        questions: view.questions,
        participants: registrations
          ? registrations.registrations.map((one) => ({
              name: one.name,
              role: roleLabel(view, one.role),
              answers: answersOf(view, one.answers),
            }))
          : view.participants.map((one) => ({
              name: one.name,
              role: roleLabel(view, one.role),
            })),
        withdrawnCount: registrations?.withdrawn.length,
        myRegistration: mine
          ? {
              active: !mine.withdrawn,
              role: roleLabel(view, mine.role),
              roleId: mine.role || undefined,
              answers: answersOf(view, mine.answers),
              registeredAt: mine.registeredAt,
            }
          : undefined,
        squad: view.squadId
          ? {
              exists: view.canManage ? !!squad : true,
              name: squad?.name,
              code: squad?.code,
            }
          : undefined,
        over: Date.parse(view.endsAt) <= Date.now(),
      };

      const text = [
        `${mdLink(detail.title, eventHref(view))} (event: ${detail.id}) — ${org ? org.name : `personal event of ${detail.organizer}`}, organized by ${detail.organizer}, ${detail.visibility}`,
        `${detail.startsAt} → ${detail.endsAt} (${detail.durationMinutes} min)${detail.over ? " — over" : ""}`,
        detail.meetingPoint || detail.meetingPlace
          ? `Meeting point: ${[view.meetingPoint, detail.meetingPlace ? mdLink(detail.meetingPlace.name, placePath(detail.meetingPlace.slug)) : undefined].filter(Boolean).join(" — ")}`
          : undefined,
        detail.description ? `\n${detail.description}\n` : undefined,
        detail.roles.length
          ? "Roles:\n" +
            detail.roles
              .map(
                (role) =>
                  `- ${role.label} (role: ${role.id}): ${role.registered}${role.wanted ? ` of ${role.wanted} wanted` : ""}`,
              )
              .join("\n")
          : undefined,
        detail.questions.length
          ? "Registration questions:\n" +
            detail.questions
              .map(
                (question) =>
                  `- ${question.label} (question: ${question.id})${question.required ? " — required" : ""}`,
              )
              .join("\n")
          : undefined,
        `${detail.registrationCount} registered` +
          (detail.participants.length
            ? ":\n" +
              detail.participants
                .map(
                  (one) =>
                    `- ${one.name}${one.role ? ` (${one.role})` : ""}` +
                    (one.answers?.length
                      ? ` — ${one.answers.map((answer) => `${answer.question}: ${answer.answer}`).join("; ")}`
                      : ""),
                )
                .join("\n")
            : "") +
          (detail.withdrawnCount ? `\n${detail.withdrawnCount} withdrew.` : ""),
        detail.myRegistration
          ? detail.myRegistration.active
            ? `You are registered${detail.myRegistration.role ? ` as ${detail.myRegistration.role}` : ""}${detail.myRegistration.answers.length ? ` (${detail.myRegistration.answers.map((answer) => `${answer.question}: ${answer.answer}`).join("; ")})` : ""}.`
            : "You withdrew from this event."
          : detail.canRegister
            ? "You are not registered."
            : "Only its organization's members and invited players can register.",
        detail.squad
          ? detail.squad.name
            ? `Squad: ${detail.squad.name} (join code ${detail.squad.code}), see ${mdLink("squads", "/squads")}.`
            : detail.squad.exists
              ? `Its squad is ready: see ${mdLink("squads", "/squads")}.`
              : "Its squad was dissolved."
          : undefined,
      ];
      return toolResult(
        { event: detail },
        text.filter((line) => line !== undefined).join("\n"),
      );
    },
  );

  server.registerTool(
    "register_event",
    {
      title: "Register to an event",
      description:
        "Register the signed-in player to an event they can see (member of its organization, or invited), or change their registration (role, answers); a withdrawn registration comes back. Pass the role (required when the event offers roles) and answers to its questions, as get_event lists them; on a change, what is not given is kept. Asks the user to confirm first.",
      inputSchema: z.object({
        eventId: eventIdInput,
        role: z
          .string()
          .optional()
          .describe("Role id or label, from get_event"),
        answers: z.array(answerInput).max(ORG_EVENT_MAX_QUESTIONS).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ event: eventEntrySchema }),
      annotations: { ...WRITE, idempotentHint: true },
      scopeChallenge: registerChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const found = await loadEvent(user.id, args.eventId);
      if ("error" in found) return found.error;
      const { view, org } = found;
      if (!view.canRegister) {
        return toolError(
          "Nothing was changed: only the organization's members and invited players can register to this event.",
        );
      }
      if (Date.parse(view.endsAt) <= Date.now()) {
        return toolError(
          "Nothing was changed: the event is over, registrations can no longer change.",
        );
      }

      const mine = view.myRegistration;
      let role =
        mine && view.roles.some((one) => one.id === mine.role)
          ? mine.role
          : undefined;
      if (args.role !== undefined) {
        const key = args.role.trim().toLocaleLowerCase();
        const picked =
          view.roles.find((one) => one.id === args.role) ??
          view.roles.find((one) => one.label.toLocaleLowerCase() === key);
        if (!picked) {
          return toolError(
            view.roles.length
              ? `Nothing was changed: no role “${args.role}”. Roles: ${view.roles.map((one) => `${one.label} (${one.id})`).join(", ")}.`
              : "Nothing was changed: this event offers no roles.",
          );
        }
        role = picked.id;
      }

      const answers: Record<string, string> = { ...(mine?.answers ?? {}) };
      for (const given of args.answers ?? []) {
        const key = given.question.trim().toLocaleLowerCase();
        const question =
          view.questions.find((one) => one.id === given.question) ??
          view.questions.find((one) => one.label.toLocaleLowerCase() === key);
        if (!question) {
          return toolError(
            `Nothing was changed: no question “${given.question}” on this event.`,
          );
        }
        answers[question.id] = given.answer;
      }

      const body = { role, answers };
      const parsed = parseRegistrationInput(body, view);
      if ("error" in parsed) {
        return toolError(`Nothing was changed: ${parsed.error}.`);
      }

      const roleText = roleLabel(view, parsed.value.role);
      const answerLines = answersOf(view, parsed.value.answers).map(
        (answer) => `- ${answer.question}: ${answer.answer}`,
      );
      const summary =
        `${isRegistered(view) ? "Change your registration to" : "Register to"} “${view.title}” (${view.startsAt}${org ? `, ${org.name}` : ""})` +
        (roleText ? ` as ${roleText}` : "") +
        "." +
        (answerLines.length ? `\nAnswers:\n${answerLines.join("\n")}` : "");
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const outcome = await registerToOrgEvent(
        view.orgId,
        view.id,
        author(user),
        body,
      );
      if ("invalid" in outcome) {
        return toolError(`Nothing was changed: ${outcome.invalid}.`);
      }
      if ("refusal" in outcome) {
        return toolError(
          `Nothing was changed: ${refusalText(outcome.refusal, "only the organization's members and invited players can register")}.`,
        );
      }
      const entry = toEntry(outcome.view, org);
      return toolResult(
        { status: "done", summary, event: entry },
        `Done: you are registered to ${mdLink(entry.title, eventHref(outcome.view))}${entry.myRole ? ` as ${entry.myRole}` : ""} (${entry.registrationCount} registered).`,
      );
    },
  );

  server.registerTool(
    "withdraw_event",
    {
      title: "Withdraw from an event",
      description:
        "Withdraw the signed-in player's registration from an upcoming event. Their answers are kept but no longer counted; register_event brings the registration back. Asks the user to confirm first.",
      inputSchema: z.object({ eventId: eventIdInput, confirm: confirmParam }),
      outputSchema: writeOutput({ event: eventEntrySchema }),
      annotations: { ...WRITE, idempotentHint: true },
      scopeChallenge: withdrawChallenge,
    },
    async ({ eventId, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const found = await loadEvent(user.id, eventId);
      if ("error" in found) return found.error;
      const { view, org } = found;
      if (!isRegistered(view)) {
        return toolError(`You are not registered to “${view.title}”.`);
      }
      if (Date.parse(view.endsAt) <= Date.now()) {
        return toolError(
          "Nothing was changed: the event is over, registrations can no longer change.",
        );
      }

      const summary = `Withdraw your registration from “${view.title}” (${view.startsAt}${org ? `, ${org.name}` : ""}).`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const outcome = await withdrawFromOrgEvent(view.orgId, view.id, user.id);
      if ("refusal" in outcome) {
        return toolError(
          `Nothing was changed: ${refusalText(outcome.refusal, MANAGE_FORBIDDEN)}.`,
        );
      }
      return toolResult(
        { status: "done", summary, event: toEntry(outcome.view, org) },
        `Done: you withdrew from ${mdLink(view.title, eventHref(view))}.`,
      );
    },
  );

  server.registerTool(
    "create_event",
    {
      title: "Plan an event",
      description: `Plan an event: in one of the signed-in player's organizations (any member can), or a personal event outside any organization when organization is omitted (always private; up to ${PERSONAL_EVENT_MAX_UPCOMING} upcoming). Give the start and either the end or the duration (at most ${ORG_EVENT_MAX_DURATION_HOURS} h), and optionally a meeting point, the roles players pick when registering and questions they answer. Asks the user to confirm first.`,
      inputSchema: z.object({
        organization: z
          .string()
          .optional()
          .describe(
            "Organization id, name or tag (list_my_events gives the player's); omit for a personal event",
          ),
        title: z.string().min(1).max(ORG_EVENT_TITLE_MAX_LENGTH),
        description: z
          .string()
          .max(ORG_EVENT_DESCRIPTION_MAX_LENGTH)
          .optional(),
        startsAt: isoDate("Start"),
        endsAt: isoDate("End").optional(),
        durationMinutes: z
          .number()
          .int()
          .positive()
          .max(ORG_EVENT_MAX_DURATION_HOURS * 60)
          .optional()
          .describe("Duration, when endsAt is not given"),
        meetingPoint: z
          .string()
          .max(ORG_EVENT_MEETING_POINT_MAX_LENGTH)
          .optional()
          .describe('Free text, e.g. "Hangar 03, Lorville"'),
        meetingPlace: z
          .string()
          .optional()
          .describe("Slug of a Nexus place to meet at (search_places)"),
        visibility: z
          .enum(["private", "public"])
          .optional()
          .describe(
            "Organization events only: private (members, the default) or public (everyone can read it; registering stays for members and invited players)",
          ),
        roles: z
          .array(roleInput.omit({ id: true }))
          .max(ORG_EVENT_MAX_ROLES)
          .optional(),
        questions: z
          .array(questionInput.omit({ id: true }))
          .max(ORG_EVENT_MAX_QUESTIONS)
          .optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ event: eventEntrySchema }),
      annotations: WRITE,
      scopeChallenge: createChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      let org: { id: string; name: string } | null = null;
      if (args.organization !== undefined) {
        const mine = await myOrganizations(user.id);
        const found = matchOrg(mine, args.organization);
        if (!found) {
          return toolError(
            `Nothing was saved: you are not a member of an organization “${args.organization}”.` +
              (mine.length
                ? ` Your organizations: ${mine.map((one) => `${one.name} (${one.id})`).join(", ")}.`
                : " Omit organization for a personal event."),
          );
        }
        org = { id: found.id, name: found.name };
      } else if (args.visibility === "public") {
        return toolError(
          "Nothing was saved: a personal event is always private; pass organization for a public event.",
        );
      }

      const endsAt = endOf(args.startsAt, args.endsAt, args.durationMinutes);
      if (endsAt === undefined) {
        return toolError("Nothing was saved: give endsAt or durationMinutes.");
      }
      const parsed = parseOrgEventInput({
        title: args.title,
        description: args.description ?? "",
        startsAt: args.startsAt,
        endsAt,
        meetingPoint: args.meetingPoint ?? "",
        meetingPlaceSlug: args.meetingPlace ?? null,
        visibility: org ? (args.visibility ?? "private") : "private",
        roles: args.roles ?? [],
        questions: args.questions ?? [],
      });
      if ("error" in parsed) {
        return toolError(`Nothing was saved: ${parsed.error}.`);
      }
      const input = parsed.value;
      const place = await placeName(input.meetingPlaceSlug);
      if ("error" in place) {
        return toolError(
          `Nothing was saved: ${refusalText("unknown-place", "")}.`,
        );
      }

      const summary =
        (org
          ? `Plan a ${input.visibility} event of ${org.name}:\n`
          : "Plan a personal event (private, shown only to you and the players you invite):\n") +
        eventInputText(input, place.name);
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const outcome = await createOrgEvent(
        org?.id ?? null,
        author(user),
        input,
      );
      if ("refusal" in outcome) {
        return toolError(
          `Nothing was saved: ${refusalText(outcome.refusal, "only the organization's members can plan its events")}.`,
        );
      }
      const entry = toEntry(outcome.view, org);
      return toolResult(
        { status: "done", summary, event: entry },
        `Done: ${mdLink(entry.title, eventHref(outcome.view))} (event: ${entry.id}) is planned. You are not registered to it yet: use register_event.`,
      );
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Change an event",
      description:
        "Change an event the signed-in player manages (their own, or any of their organization's when they are one of its editors). Only the given fields change; moving the start without an end keeps the duration. roles and questions replace the whole list: pass back the ids from get_event to keep the registrations and answers tied to them. Asks the user to confirm first.",
      inputSchema: z.object({
        eventId: eventIdInput,
        title: z.string().min(1).max(ORG_EVENT_TITLE_MAX_LENGTH).optional(),
        description: z
          .string()
          .max(ORG_EVENT_DESCRIPTION_MAX_LENGTH)
          .optional(),
        startsAt: isoDate("New start").optional(),
        endsAt: isoDate("New end").optional(),
        durationMinutes: z
          .number()
          .int()
          .positive()
          .max(ORG_EVENT_MAX_DURATION_HOURS * 60)
          .optional(),
        meetingPoint: z
          .string()
          .max(ORG_EVENT_MEETING_POINT_MAX_LENGTH)
          .nullable()
          .optional(),
        meetingPlace: z
          .string()
          .nullable()
          .optional()
          .describe("Slug of a Nexus place (search_places); null removes it"),
        visibility: z.enum(["private", "public"]).optional(),
        roles: z.array(roleInput).max(ORG_EVENT_MAX_ROLES).optional(),
        questions: z
          .array(questionInput)
          .max(ORG_EVENT_MAX_QUESTIONS)
          .optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ event: eventEntrySchema }),
      annotations: WRITE,
      scopeChallenge: updateChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const found = await loadEvent(user.id, args.eventId);
      if ("error" in found) return found.error;
      const { view, org } = found;
      if (!view.canManage) {
        return toolError(`Nothing was changed: ${MANAGE_FORBIDDEN}.`);
      }
      if (view.orgId === null && args.visibility === "public") {
        return toolError(
          "Nothing was changed: a personal event is always private.",
        );
      }

      const startsAt = args.startsAt ?? view.startsAt;
      const endsAt =
        endOf(startsAt, args.endsAt, args.durationMinutes) ??
        (args.startsAt !== undefined && !Number.isNaN(Date.parse(startsAt))
          ? new Date(
              Date.parse(startsAt) +
                (Date.parse(view.endsAt) - Date.parse(view.startsAt)),
            ).toISOString()
          : view.endsAt);
      // L'évènement entier, comme le formulaire le renvoie.
      const parsed = parseOrgEventInput({
        title: args.title ?? view.title,
        description: args.description ?? view.description,
        startsAt,
        endsAt,
        meetingPoint:
          args.meetingPoint === undefined
            ? view.meetingPoint
            : (args.meetingPoint ?? ""),
        meetingPlaceSlug:
          args.meetingPlace === undefined
            ? (view.meetingPlace?.slug ?? null)
            : args.meetingPlace,
        visibility: args.visibility ?? view.visibility,
        roles:
          args.roles ??
          view.roles.map(({ id, label, icon, wanted }) => ({
            id,
            label,
            icon,
            wanted,
          })),
        questions: args.questions ?? view.questions,
      });
      if ("error" in parsed) {
        return toolError(`Nothing was changed: ${parsed.error}.`);
      }
      const input = parsed.value;

      const changes: string[] = [];
      if (input.title !== view.title) changes.push(`title → “${input.title}”`);
      if (input.description !== view.description) {
        changes.push(input.description ? "new description" : "no description");
      }
      if (input.startsAt !== view.startsAt || input.endsAt !== view.endsAt) {
        changes.push(`dates → ${input.startsAt} → ${input.endsAt}`);
      }
      if (input.meetingPoint !== view.meetingPoint) {
        changes.push(`meeting point → ${input.meetingPoint || "none"}`);
      }
      let newPlace: string | undefined;
      if (input.meetingPlaceSlug !== (view.meetingPlace?.slug ?? null)) {
        const place = await placeName(input.meetingPlaceSlug);
        if ("error" in place) {
          return toolError(
            `Nothing was changed: ${refusalText("unknown-place", "")}.`,
          );
        }
        newPlace = place.name;
        changes.push(`meeting place → ${newPlace ?? "none"}`);
      }
      if (input.visibility !== view.visibility) {
        changes.push(`visibility → ${input.visibility}`);
      }
      if (args.roles !== undefined) {
        const kept = new Set(input.roles.flatMap((role) => role.id ?? []));
        const dropped = view.roles.filter((role) => !kept.has(role.id));
        changes.push(
          `roles → ${input.roles.map((role) => `${role.label}${role.wanted ? ` (${role.wanted} wanted)` : ""}`).join(", ") || "none"}` +
            (dropped.some((role) => view.roleCounts[role.id])
              ? ` (registrations with ${dropped.map((role) => role.label).join(", ")} will read as no role)`
              : ""),
        );
      }
      if (args.questions !== undefined) {
        changes.push(
          `questions → ${input.questions.map((question) => `“${question.label}”${question.required ? " (required)" : ""}`).join(", ") || "none"}`,
        );
      }
      if (changes.length === 0) return toolError("Nothing to change.");

      const summary = `Change the event “${view.title}”${org ? ` of ${org.name}` : ""} (event ${view.id}): ${changes.join("; ")}.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const outcome = await updateOrgEvent(view.orgId, view.id, user.id, input);
      if ("refusal" in outcome) {
        return toolError(
          `Nothing was changed: ${refusalText(outcome.refusal, MANAGE_FORBIDDEN)}.`,
        );
      }
      return toolResult(
        { status: "done", summary, event: toEntry(outcome.view, org) },
        `Done: ${summary} See ${mdLink(outcome.view.title, eventHref(outcome.view))}.`,
      );
    },
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete an event",
      description:
        "Delete an event the signed-in player manages (their own, or any of their organization's when they are one of its editors), with its registrations and shares. Cannot be undone. Asks the user to confirm first.",
      inputSchema: z.object({ eventId: eventIdInput, confirm: confirmParam }),
      outputSchema: writeOutput({ removed: z.boolean() }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: deleteChallenge,
    },
    async ({ eventId, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const found = await loadEvent(user.id, eventId);
      if ("error" in found) return found.error;
      const { view, org } = found;
      if (!view.canManage) {
        return toolError(`Nothing was removed: ${MANAGE_FORBIDDEN}.`);
      }

      const summary =
        `Delete the event “${view.title}” (${view.startsAt}${org ? `, ${org.name}` : ", personal"})` +
        (view.registrationCount
          ? ` and its ${view.registrationCount} registrations`
          : "") +
        ". This cannot be undone.";
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const outcome = await deleteOrgEvent(view.orgId, view.id, user.id);
      if ("refusal" in outcome) {
        return toolError(
          `Nothing was removed: ${refusalText(outcome.refusal, MANAGE_FORBIDDEN)}.`,
        );
      }
      return toolResult(
        { status: "done", summary, removed: true },
        `Done: “${view.title}” is deleted.`,
      );
    },
  );

  server.registerTool(
    "plan_session",
    {
      title: "Plan my next session",
      description: `Plan the signed-in player's next game session, shown to their friends and organization members: a time (within ${PLANNED_SESSION_MAX_DAYS_AHEAD} days) and an activity, or an upcoming event they are registered to (its start and title by default). Replaces the session already planned; starting to play uses it up. Asks the user to confirm first.`,
      inputSchema: z.object({
        at: isoDate("When the session starts")
          .optional()
          .describe(
            "When the session starts, ISO 8601 with offset; required without eventId",
          ),
        activity: activityInput.describe(
          'What the player will do, e.g. "Mining"; null for nothing; the event title by default',
        ),
        eventId: z
          .string()
          .optional()
          .describe(
            "An upcoming event the player is registered to (list_my_events with registeredOnly)",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ presence: presenceSchema }),
      annotations: { ...WRITE, idempotentHint: true },
      scopeChallenge: planChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const userOid = new ObjectId(user.id);

      let event: { orgId: string | null; eventId: string } | undefined;
      let eventText = "";
      let at = args.at;
      let activity = args.activity === undefined ? undefined : args.activity;
      if (args.eventId !== undefined) {
        const upcoming = (await listMyUpcomingEvents(user.id)).find(
          (one) => one.eventId === args.eventId,
        );
        if (!upcoming) {
          return toolError(
            `Nothing was planned: ${args.eventId} is not an upcoming event (next ${PLANNED_SESSION_MAX_DAYS_AHEAD} days) you are registered to.`,
          );
        }
        event = { orgId: upcoming.orgId, eventId: upcoming.eventId };
        eventText = ` for the event “${upcoming.title}”${upcoming.orgName ? ` (${upcoming.orgName})` : ""}`;
        at ??= upcoming.startsAt;
        if (activity === undefined) {
          activity = upcoming.title.slice(0, PRESENCE_ACTIVITY_MAX_LENGTH);
        }
      }
      if (at === undefined) {
        return toolError("Nothing was planned: give at, or an eventId.");
      }
      const when = Date.parse(at);
      const now = Date.now();
      if (Number.isNaN(when)) {
        return toolError("Nothing was planned: at must be an ISO date.");
      }
      if (
        when <= now - PLANNED_SESSION_GRACE_HOURS * 3_600_000 ||
        when > now + PLANNED_SESSION_MAX_DAYS_AHEAD * 86_400_000
      ) {
        return toolError(
          `Nothing was planned: the session must be within the next ${PLANNED_SESSION_MAX_DAYS_AHEAD} days.`,
        );
      }
      const normalized =
        activity === undefined ? null : normalizeActivity(activity);
      if (normalized === false) {
        return toolError(
          `Nothing was planned: the activity is at most ${PRESENCE_ACTIVITY_MAX_LENGTH} characters.`,
        );
      }

      const current = await getMyPresence(userOid);
      const summary =
        `Plan your next session at ${new Date(when).toISOString()}` +
        (normalized ? ` (${normalized})` : "") +
        eventText +
        ", shown to your friends and organization members" +
        (current.planned
          ? `; it replaces the one planned at ${current.planned.at}`
          : "") +
        ".";
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const outcome = await planSession(userOid, {
        at,
        activity: normalized,
        ...(event ? { event } : {}),
      });
      if ("error" in outcome) {
        return toolError(`Nothing was planned: ${outcome.error}.`);
      }
      const presence = toPresence(outcome.presence);
      return toolResult(
        { status: "done", summary, presence },
        `Done: ${presenceText(presence)} See ${mdLink("your profile", PROFILE_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "cancel_planned_session",
    {
      title: "Cancel my planned session",
      description:
        "Cancel the signed-in player's planned next session, so their friends and organization members no longer see it. Asks the user to confirm first.",
      inputSchema: z.object({ confirm: confirmParam }),
      outputSchema: writeOutput({ presence: presenceSchema }),
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
      scopeChallenge: cancelPlanChallenge,
    },
    async ({ confirm }, ctx) => {
      const user = await currentUser(ctx);
      const userOid = new ObjectId(user.id);
      const current = await getMyPresence(userOid);
      if (!current.planned) return toolError("No session is planned.");

      const summary =
        `Cancel your session planned at ${current.planned.at}` +
        (current.planned.activity ? ` (${current.planned.activity})` : "") +
        ".";
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const presence = toPresence(await cancelPlannedSession(userOid));
      return toolResult(
        { status: "done", summary, presence },
        `Done: ${presenceText(presence)}`,
      );
    },
  );

  server.registerTool(
    "set_playing",
    {
      title: "Set my in-game status",
      description: `Declare that the signed-in player is in game, with what they are doing, or that they stopped, as on their profile; friends and organization members see it. The declaration lapses after ${PRESENCE_TTL_HOURS} h unless renewed (calling again renews it). Starting a session uses up the planned one and takes its activity when none is given. Stopping also clears the position they shared. Asks the user to confirm first.`,
      inputSchema: z.object({
        playing: z.boolean().describe("true: in game; false: stopped"),
        activity: activityInput.describe(
          'What the player is doing, e.g. "Mining"; null clears it; omitted keeps the current one',
        ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ presence: presenceSchema }),
      annotations: { ...WRITE, idempotentHint: true },
      scopeChallenge: playingChallenge,
    },
    async ({ playing, activity, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const userOid = new ObjectId(user.id);
      const current = await getMyPresence(userOid);

      let summary: string;
      let requested: string | null | undefined;
      if (playing) {
        const normalized =
          activity === undefined ? undefined : normalizeActivity(activity);
        if (normalized === false) {
          return toolError(
            `Nothing was changed: the activity is at most ${PRESENCE_ACTIVITY_MAX_LENGTH} characters.`,
          );
        }
        requested = normalized;
        const shown =
          requested !== undefined
            ? requested
            : current.playing
              ? current.activity
              : (current.planned?.activity ?? null);
        summary =
          (current.playing
            ? "Stay in game for the next "
            : "Show you as in game for the next ") +
          `${PRESENCE_TTL_HOURS} hours` +
          (shown ? ` (${shown})` : "") +
          " to your friends and organization members" +
          (!current.playing && current.planned
            ? "; this uses up your planned session"
            : "") +
          ".";
      } else {
        if (!current.playing) return toolError("You are not shown as in game.");
        summary =
          "Show you as no longer in game; the position you shared is cleared.";
      }
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const presence = toPresence(
        playing
          ? await declarePlaying(userOid, requested)
          : await stopPlaying(userOid),
      );
      return toolResult(
        { status: "done", summary, presence },
        `Done: ${presenceText(presence)}`,
      );
    },
  );
}
