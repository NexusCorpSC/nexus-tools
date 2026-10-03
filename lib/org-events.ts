import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { newCode } from "@/lib/join-codes";
import { getPlaceBySlug } from "@/lib/places";
import type { Organization } from "@/app/orgs/page";
import { isSquadRoleIcon } from "@/types/squad";
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
  ORG_EVENT_VISIBILITIES,
  type OrgEvent,
  type OrgEventAuthor,
  type OrgEventQuestion,
  type OrgEventRegistration,
  type OrgEventRole,
  type OrgEventSummary,
  type OrgEventView,
  type OrgEventVisibility,
} from "@/types/org-events";

/**
 * Les évènements d'organisation, un document par évènement, inscriptions
 * embarquées.
 *
 * Embarquées pour la même raison que les membres d'une escouade : la fiche se
 * lit d'un `findOne`, et une inscription n'a pas de vie hors de son évènement.
 * Chaque écriture d'une inscription est donc positionnelle — deux membres qui
 * s'inscrivent au même instant ne doivent pas s'écraser.
 *
 * Collection `orgEvents`, index `{ orgId, startsAt }` posé par
 * `scripts/ensure-indexes.ts`.
 */

export interface DbOrgEvent {
  _id: ObjectId;
  orgId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  meetingPoint: string;
  meetingPlace: { slug: string; name: string } | null;
  visibility: OrgEventVisibility;
  /** `wanted` manque aux rôles des évènements créés avant lui : voir `toEvent`. */
  roles: (Omit<OrgEventRole, "wanted"> & { wanted?: number | null })[];
  questions: OrgEventQuestion[];
  createdBy: OrgEventAuthor;
  squadId: string | null;
  registrations: OrgEventRegistration[];
  createdAt: string;
  updatedAt: string;
}

function collection() {
  return db.db().collection<DbOrgEvent>("orgEvents");
}

// ─── Accès ────────────────────────────────────────────────────────────────────

/** Ce que le lecteur est pour l'organisation. `null` quand elle n'existe pas. */
export interface OrgAccess {
  isMember: boolean;
  isEditor: boolean;
}

export async function getOrgAccess(
  orgId: string,
  readerId: string | null,
): Promise<OrgAccess | null> {
  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId }, { projection: { members: 1 } });

  if (!org) return null;

  const member = readerId
    ? (org.members ?? []).find((candidate) =>
        new ObjectId(candidate.userId).equals(readerId),
      )
    : undefined;

  return { isMember: !!member, isEditor: !!member?.editor };
}

function canRead(doc: DbOrgEvent, access: OrgAccess): boolean {
  return access.isMember || doc.visibility === "public";
}

/** Le créateur, ou un éditeur de l'organisation — et membre dans les deux cas. */
function canManage(
  doc: Pick<DbOrgEvent, "createdBy">,
  access: OrgAccess,
  readerId: string | null,
): boolean {
  if (!access.isMember) return false;
  return access.isEditor || doc.createdBy.userId === readerId;
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

function toEvent(doc: DbOrgEvent): OrgEvent {
  return {
    id: doc._id.toString(),
    orgId: doc.orgId,
    title: doc.title,
    description: doc.description,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    meetingPoint: doc.meetingPoint,
    meetingPlace: doc.meetingPlace ?? null,
    visibility: doc.visibility,
    // `wanted` est absent des évènements créés avant les places souhaitées.
    roles: doc.roles.map((role) => ({ ...role, wanted: role.wanted ?? null })),
    questions: doc.questions,
    createdBy: doc.createdBy,
    squadId: doc.squadId ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Une inscription telle qu'on la rend : un rôle supprimé depuis se lit
 * « aucun », et les réponses à des questions retirées disparaissent. Rien
 * n'est réécrit en base — remettre la question rend la réponse.
 */
function toRegistration(
  registration: OrgEventRegistration,
  doc: DbOrgEvent,
): OrgEventRegistration {
  const role = doc.roles.some((candidate) => candidate.id === registration.role)
    ? registration.role
    : "";

  const answers: Record<string, string> = {};
  for (const question of doc.questions) {
    const answer = registration.answers?.[question.id];
    if (answer) answers[question.id] = answer;
  }

  return { ...registration, role, answers };
}

function activeRegistrations(doc: DbOrgEvent): OrgEventRegistration[] {
  return doc.registrations
    .filter((registration) => !registration.withdrawn)
    .map((registration) => toRegistration(registration, doc));
}

function countByRole(
  registrations: OrgEventRegistration[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const registration of registrations) {
    counts[registration.role] = (counts[registration.role] ?? 0) + 1;
  }
  return counts;
}

function toView(
  doc: DbOrgEvent,
  access: OrgAccess,
  readerId: string | null,
): OrgEventView {
  const active = activeRegistrations(doc);
  const mine = readerId
    ? doc.registrations.find((registration) => registration.userId === readerId)
    : undefined;

  return {
    ...toEvent(doc),
    registrationCount: active.length,
    roleCounts: countByRole(active),
    participants: access.isMember
      ? active.map(({ userId, name, role }) => ({ userId, name, role }))
      : [],
    myRegistration: mine ? toRegistration(mine, doc) : null,
    canRegister: access.isMember,
    canManage: canManage(doc, access, readerId),
  };
}

async function findEvent(
  orgId: string,
  eventId: string,
): Promise<DbOrgEvent | null> {
  if (!ObjectId.isValid(eventId)) return null;
  return collection().findOne({ _id: new ObjectId(eventId), orgId });
}

const LIST_LIMIT = 200;

/** Par défaut, le calendrier part d'un jour en arrière : ce qui vient de finir y est encore. */
const DEFAULT_LOOKBACK_MS = 24 * 3_600_000;

/**
 * Les évènements d'une organisation qui recouvrent `[from, to[`, du plus tôt
 * au plus tard ; sans `from`, depuis la veille. Un non-membre n'y voit que les
 * publics.
 *
 * `null` quand l'organisation n'existe pas.
 */
export async function listOrgEvents(
  orgId: string,
  readerId: string | null,
  range: { from: Date | null; to: Date | null },
): Promise<OrgEventView[] | null> {
  const access = await getOrgAccess(orgId, readerId);
  if (!access) return null;

  const filter: Record<string, unknown> = {
    orgId,
    endsAt: {
      $gt: (
        range.from ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS)
      ).toISOString(),
    },
  };
  if (range.to) filter.startsAt = { $lt: range.to.toISOString() };
  if (!access.isMember) filter.visibility = "public";

  const docs = await collection()
    .find(filter)
    .sort({ startsAt: 1 })
    .limit(LIST_LIMIT)
    .toArray();

  return docs.map((doc) => toView(doc, access, readerId));
}

/**
 * Les évènements terminés, du plus récent au plus ancien : l'onglet « Passés »
 * du calendrier.
 */
export async function listPastOrgEvents(
  orgId: string,
  readerId: string | null,
): Promise<OrgEventView[] | null> {
  const access = await getOrgAccess(orgId, readerId);
  if (!access) return null;

  const filter: Record<string, unknown> = {
    orgId,
    endsAt: { $lte: new Date().toISOString() },
  };
  if (!access.isMember) filter.visibility = "public";

  const docs = await collection()
    .find(filter)
    .sort({ startsAt: -1 })
    .limit(LIST_LIMIT)
    .toArray();

  return docs.map((doc) => toView(doc, access, readerId));
}

/** `null` quand l'évènement n'existe pas ou que le lecteur ne peut pas le voir. */
export async function getOrgEventView(
  orgId: string,
  eventId: string,
  readerId: string | null,
): Promise<OrgEventView | null> {
  const [access, doc] = await Promise.all([
    getOrgAccess(orgId, readerId),
    findEvent(orgId, eventId),
  ]);

  if (!access || !doc || !canRead(doc, access)) return null;

  return toView(doc, access, readerId);
}

export type SummaryOutcome =
  | { summary: OrgEventSummary }
  | { refusal: "not-found" | "forbidden" };

/** Le résumé de l'organisateur : inscrits actifs, réponses, comptes par rôle. */
export async function getOrgEventSummary(
  orgId: string,
  eventId: string,
  readerId: string,
): Promise<SummaryOutcome> {
  const [access, doc] = await Promise.all([
    getOrgAccess(orgId, readerId),
    findEvent(orgId, eventId),
  ]);

  if (!access || !doc || !canRead(doc, access)) return { refusal: "not-found" };
  if (!canManage(doc, access, readerId)) return { refusal: "forbidden" };

  const registrations = activeRegistrations(doc);
  const roleCounts = countByRole(registrations);

  return {
    summary: {
      eventId,
      registrationCount: registrations.length,
      roleCounts,
      registrations,
      withdrawn: doc.registrations
        .filter((registration) => registration.withdrawn)
        .map((registration) => toRegistration(registration, doc)),
    },
  };
}

// ─── Saisie ───────────────────────────────────────────────────────────────────

type Parsed<T> = { value: T } | { error: string };

/** Un évènement saisi, validé, avant résolution du lieu et des ids. */
export interface ParsedOrgEventInput {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  meetingPoint: string;
  meetingPlaceSlug: string | null;
  visibility: OrgEventVisibility;
  roles: {
    id: string | null;
    label: string;
    icon: OrgEventRole["icon"];
    wanted: number | null;
  }[];
  questions: { id: string | null; label: string; required: boolean }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Une chaîne sur une ligne, sans espaces superflus ; absente vaut `""`. */
function readLine(
  body: Record<string, unknown>,
  key: string,
  max: number,
): Parsed<string> {
  const value = body[key];
  if (value === undefined || value === null) return { value: "" };
  if (typeof value !== "string")
    return { error: `\`${key}\` must be a string` };

  const line = value.replace(/\s+/g, " ").trim();
  if (line.length > max) {
    return { error: `\`${key}\` must be at most ${max} characters` };
  }

  return { value: line };
}

function readDate(body: Record<string, unknown>, key: string): Parsed<Date> {
  const value = body[key];
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;

  if (Number.isNaN(parsed)) {
    return { error: `\`${key}\` must be an ISO date` };
  }

  return { value: new Date(parsed) };
}

function readId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Valide ce qu'un client envoie pour créer ou modifier un évènement.
 *
 * Une modification renvoie l'évènement entier, comme le formulaire le tient :
 * pas de champ « absent veut dire inchangé », qui laisserait deux onglets
 * ouverts se contredire en silence.
 */
export function parseOrgEventInput(body: unknown): Parsed<ParsedOrgEventInput> {
  if (!isRecord(body)) return { error: "Body must be a JSON object" };

  const title = readLine(body, "title", ORG_EVENT_TITLE_MAX_LENGTH);
  if ("error" in title) return title;
  if (!title.value) return { error: "`title` must not be empty" };

  const rawDescription = body.description ?? "";
  if (typeof rawDescription !== "string") {
    return { error: "`description` must be a string" };
  }
  const description = rawDescription.trim();
  if (description.length > ORG_EVENT_DESCRIPTION_MAX_LENGTH) {
    return {
      error: `\`description\` must be at most ${ORG_EVENT_DESCRIPTION_MAX_LENGTH} characters`,
    };
  }

  const startsAt = readDate(body, "startsAt");
  if ("error" in startsAt) return startsAt;
  const endsAt = readDate(body, "endsAt");
  if ("error" in endsAt) return endsAt;

  const duration = endsAt.value.getTime() - startsAt.value.getTime();
  if (duration <= 0) return { error: "`endsAt` must be after `startsAt`" };
  if (duration > ORG_EVENT_MAX_DURATION_HOURS * 3_600_000) {
    return {
      error: `An event lasts at most ${ORG_EVENT_MAX_DURATION_HOURS} hours`,
    };
  }

  const meetingPoint = readLine(
    body,
    "meetingPoint",
    ORG_EVENT_MEETING_POINT_MAX_LENGTH,
  );
  if ("error" in meetingPoint) return meetingPoint;

  const meetingPlaceSlug = readId(body.meetingPlaceSlug);

  const visibility = body.visibility ?? "private";
  if (!(ORG_EVENT_VISIBILITIES as readonly unknown[]).includes(visibility)) {
    return { error: "`visibility` must be `private` or `public`" };
  }

  const rawRoles = body.roles ?? [];
  if (!Array.isArray(rawRoles)) return { error: "`roles` must be an array" };
  if (rawRoles.length > ORG_EVENT_MAX_ROLES) {
    return { error: `An event offers at most ${ORG_EVENT_MAX_ROLES} roles` };
  }

  const roles: ParsedOrgEventInput["roles"] = [];
  for (const raw of rawRoles) {
    if (!isRecord(raw)) return { error: "Each role must be an object" };
    const label = readLine(raw, "label", ORG_EVENT_ROLE_LABEL_MAX_LENGTH);
    if ("error" in label) return label;
    if (!label.value) return { error: "A role label must not be empty" };
    if (!isSquadRoleIcon(raw.icon)) {
      return { error: "A role `icon` must be one of the known role icons" };
    }
    const wanted = raw.wanted ?? null;
    if (
      wanted !== null &&
      !(
        Number.isInteger(wanted) &&
        (wanted as number) >= 1 &&
        (wanted as number) <= ORG_EVENT_MAX_REGISTRATIONS
      )
    ) {
      return {
        error: `A role's \`wanted\` must be null or an integer from 1 to ${ORG_EVENT_MAX_REGISTRATIONS}`,
      };
    }
    roles.push({
      id: readId(raw.id),
      label: label.value,
      icon: raw.icon,
      wanted: wanted as number | null,
    });
  }

  const rawQuestions = body.questions ?? [];
  if (!Array.isArray(rawQuestions)) {
    return { error: "`questions` must be an array" };
  }
  if (rawQuestions.length > ORG_EVENT_MAX_QUESTIONS) {
    return {
      error: `An event asks at most ${ORG_EVENT_MAX_QUESTIONS} questions`,
    };
  }

  const questions: ParsedOrgEventInput["questions"] = [];
  for (const raw of rawQuestions) {
    if (!isRecord(raw)) return { error: "Each question must be an object" };
    const label = readLine(raw, "label", ORG_EVENT_QUESTION_MAX_LENGTH);
    if ("error" in label) return label;
    if (!label.value) return { error: "A question must not be empty" };
    questions.push({
      id: readId(raw.id),
      label: label.value,
      required: raw.required === true,
    });
  }

  return {
    value: {
      title: title.value,
      description,
      startsAt: startsAt.value.toISOString(),
      endsAt: endsAt.value.toISOString(),
      meetingPoint: meetingPoint.value,
      meetingPlaceSlug,
      visibility: visibility as OrgEventVisibility,
      roles,
      questions,
    },
  };
}

/**
 * Donne un id à chaque élément : celui qu'il avait s'il est encore connu,
 * un neuf sinon. Un id inventé par le client n'est pas repris — sans quoi deux
 * rôles pourraient partager le même, ou en reprendre un supprimé.
 */
function assignIds<T extends { id: string | null }>(
  items: T[],
  known: { id: string }[],
  prefix: string,
): (Omit<T, "id"> & { id: string })[] {
  const available = new Set(known.map((item) => item.id));

  return items.map((item) => {
    const id = item.id && available.has(item.id) ? item.id : null;
    if (id) available.delete(id);
    return { ...item, id: id ?? `${prefix}${newCode()}` };
  });
}

export type WriteOutcome =
  | { view: OrgEventView }
  | { refusal: "not-found" | "forbidden" | "unknown-place" };

async function resolvePlace(
  slug: string | null,
): Promise<
  { place: DbOrgEvent["meetingPlace"] } | { refusal: "unknown-place" }
> {
  if (!slug) return { place: null };
  const place = await getPlaceBySlug(slug);
  if (!place) return { refusal: "unknown-place" };
  return { place: { slug: place.slug, name: place.name } };
}

/** Un membre de l'organisation prévoit un évènement. */
export async function createOrgEvent(
  orgId: string,
  author: OrgEventAuthor,
  input: ParsedOrgEventInput,
): Promise<WriteOutcome> {
  const access = await getOrgAccess(orgId, author.userId);
  if (!access) return { refusal: "not-found" };
  if (!access.isMember) return { refusal: "forbidden" };

  const resolved = await resolvePlace(input.meetingPlaceSlug);
  if ("refusal" in resolved) return resolved;

  const now = new Date().toISOString();
  const doc: DbOrgEvent = {
    _id: new ObjectId(),
    orgId,
    title: input.title,
    description: input.description,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    meetingPoint: input.meetingPoint,
    meetingPlace: resolved.place,
    visibility: input.visibility,
    roles: assignIds(input.roles, [], "r"),
    questions: assignIds(input.questions, [], "q"),
    createdBy: author,
    squadId: null,
    registrations: [],
    createdAt: now,
    updatedAt: now,
  };

  await collection().insertOne(doc);

  return { view: toView(doc, access, author.userId) };
}

/**
 * Remplace la description de l'évènement par la saisie.
 *
 * Les inscriptions ne sont pas touchées : un rôle ou une question retirés se
 * lisent « absents » (voir `toRegistration`), et reviennent si on les remet
 * avec leur id.
 */
export async function updateOrgEvent(
  orgId: string,
  eventId: string,
  readerId: string,
  input: ParsedOrgEventInput,
): Promise<WriteOutcome> {
  const [access, doc] = await Promise.all([
    getOrgAccess(orgId, readerId),
    findEvent(orgId, eventId),
  ]);

  if (!access || !doc || !canRead(doc, access)) return { refusal: "not-found" };
  if (!canManage(doc, access, readerId)) return { refusal: "forbidden" };

  const resolved = await resolvePlace(input.meetingPlaceSlug);
  if ("refusal" in resolved) return resolved;

  const updated = await collection().findOneAndUpdate(
    { _id: doc._id },
    {
      $set: {
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        meetingPoint: input.meetingPoint,
        meetingPlace: resolved.place,
        visibility: input.visibility,
        roles: assignIds(input.roles, doc.roles, "r"),
        questions: assignIds(input.questions, doc.questions, "q"),
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" },
  );

  if (!updated) return { refusal: "not-found" };

  return { view: toView(updated, access, readerId) };
}

export async function deleteOrgEvent(
  orgId: string,
  eventId: string,
  readerId: string,
): Promise<{ deleted: true } | { refusal: "not-found" | "forbidden" }> {
  const [access, doc] = await Promise.all([
    getOrgAccess(orgId, readerId),
    findEvent(orgId, eventId),
  ]);

  if (!access || !doc || !canRead(doc, access)) return { refusal: "not-found" };
  if (!canManage(doc, access, readerId)) return { refusal: "forbidden" };

  await collection().deleteOne({ _id: doc._id });

  return { deleted: true };
}

// ─── Inscriptions ─────────────────────────────────────────────────────────────

/** Un rôle et des réponses, validés contre ce que l'évènement demande. */
export function parseRegistrationInput(
  body: unknown,
  event: { roles: { id: string }[]; questions: OrgEventQuestion[] },
): Parsed<{ role: string; answers: Record<string, string> }> {
  const record = isRecord(body) ? body : {};

  let role = "";
  if (event.roles.length > 0) {
    const requested = record.role;
    if (
      typeof requested !== "string" ||
      !event.roles.some((candidate) => candidate.id === requested)
    ) {
      return { error: "`role` must be one of the event's roles" };
    }
    role = requested;
  }

  const rawAnswers = record.answers ?? {};
  if (!isRecord(rawAnswers)) return { error: "`answers` must be an object" };

  const answers: Record<string, string> = {};
  for (const question of event.questions) {
    const raw = rawAnswers[question.id];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      return { error: "Each answer must be a string" };
    }

    const answer = (raw ?? "").trim();
    if (answer.length > ORG_EVENT_ANSWER_MAX_LENGTH) {
      return {
        error: `An answer must be at most ${ORG_EVENT_ANSWER_MAX_LENGTH} characters`,
      };
    }
    if (!answer && question.required) {
      return { error: `An answer to «${question.label}» is required` };
    }
    if (answer) answers[question.id] = answer;
  }

  return { value: { role, answers } };
}

export type RegisterOutcome =
  | { view: OrgEventView }
  | { refusal: "not-found" | "forbidden" | "closed" | "full" }
  | { invalid: string };

/**
 * Inscrit le membre, ou met à jour son inscription — désinscrite comprise, qui
 * redevient active avec les nouvelles réponses.
 *
 * Fermé une fois l'évènement terminé : les réponses font alors partie du
 * compte rendu, plus de la préparation.
 */
export async function registerToOrgEvent(
  orgId: string,
  eventId: string,
  caller: OrgEventAuthor,
  body: unknown,
): Promise<RegisterOutcome> {
  const [access, doc] = await Promise.all([
    getOrgAccess(orgId, caller.userId),
    findEvent(orgId, eventId),
  ]);

  if (!access || !doc || !canRead(doc, access)) return { refusal: "not-found" };
  if (!access.isMember) return { refusal: "forbidden" };
  if (new Date(doc.endsAt) <= new Date()) return { refusal: "closed" };

  const parsed = parseRegistrationInput(body, doc);
  if ("error" in parsed) return { invalid: parsed.error };

  const now = new Date().toISOString();

  const rewrite = () =>
    collection().findOneAndUpdate(
      { _id: doc._id, "registrations.userId": caller.userId },
      {
        $set: {
          "registrations.$.name": caller.name,
          "registrations.$.role": parsed.value.role,
          "registrations.$.answers": parsed.value.answers,
          "registrations.$.withdrawn": false,
          "registrations.$.updatedAt": now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );

  let updated = doc.registrations.some(
    (registration) => registration.userId === caller.userId,
  )
    ? await rewrite()
    : null;

  if (!updated) {
    const registration: OrgEventRegistration = {
      userId: caller.userId,
      name: caller.name,
      role: parsed.value.role,
      answers: parsed.value.answers,
      withdrawn: false,
      registeredAt: now,
      updatedAt: now,
    };

    updated = await collection().findOneAndUpdate(
      {
        _id: doc._id,
        // Pas encore inscrit, et de la place : relus dans l'écriture, parce
        // que la lecture d'au-dessus a déjà un instant.
        "registrations.userId": { $ne: caller.userId },
        $expr: {
          $lt: [{ $size: "$registrations" }, ORG_EVENT_MAX_REGISTRATIONS],
        },
      },
      { $push: { registrations: registration }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );

    // Refusé : soit l'autre client du même membre est passé avant — sa ligne
    // existe, on la met à jour —, soit l'évènement est plein, soit il a été
    // supprimé entre-temps.
    if (!updated) updated = await rewrite();
    if (!updated) {
      const current = await collection().findOne(
        { _id: doc._id },
        { projection: { _id: 1 } },
      );
      return { refusal: current ? "full" : "not-found" };
    }
  }

  return { view: toView(updated, access, caller.userId) };
}

/**
 * Désinscrit le membre. Ses réponses restent, hors des comptes. Idempotent :
 * pas inscrit, ou déjà désinscrit, ne change rien.
 *
 * Fermé une fois l'évènement terminé, comme l'inscription : qui était inscrit
 * fait alors partie du compte rendu.
 */
export async function withdrawFromOrgEvent(
  orgId: string,
  eventId: string,
  readerId: string,
): Promise<{ view: OrgEventView } | { refusal: "not-found" | "closed" }> {
  const [access, doc] = await Promise.all([
    getOrgAccess(orgId, readerId),
    findEvent(orgId, eventId),
  ]);

  if (!access || !doc || !canRead(doc, access)) return { refusal: "not-found" };
  if (new Date(doc.endsAt) <= new Date()) return { refusal: "closed" };

  const now = new Date().toISOString();
  const updated = await collection().findOneAndUpdate(
    {
      _id: doc._id,
      registrations: { $elemMatch: { userId: readerId, withdrawn: false } },
    },
    {
      $set: {
        "registrations.$.withdrawn": true,
        "registrations.$.updatedAt": now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );

  return { view: toView(updated ?? doc, access, readerId) };
}
