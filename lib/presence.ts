import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import type { Organization } from "@/app/orgs/page";
import { findMyUpcomingEvent } from "@/lib/org-events";
import {
  PLANNED_SESSION_GRACE_HOURS,
  PLANNED_SESSION_MAX_DAYS_AHEAD,
  PRESENCE_ACTIVITY_MAX_LENGTH,
  PRESENCE_TTL_HOURS,
  type MemberPlanned,
  type MemberPresence,
  type MyPresence,
  type OrgPresence,
  type PlannedEventRef,
  type PlannedSession,
} from "@/types/presence";

/**
 * Une déclaration par utilisateur : l'identifiant est la clé naturelle de la
 * collection, un index unique tient la règle (`scripts/ensure-indexes.ts`).
 *
 * Arrêter de jouer supprime le document plutôt que de le marquer : il n'y a
 * rien à garder d'une session finie, et « pas de document » se lit comme « ne
 * joue pas » partout.
 */
export interface DbPresence {
  userId: ObjectId;
  activity: string | null;
  since: string;
  updatedAt: string;
  expiresAt: string;
}

function collection() {
  return db.db().collection<DbPresence>("presences");
}

/**
 * Une session prévue par utilisateur, à part de la déclaration « en jeu » :
 * on peut jouer et avoir déjà prévu la suivante. Même clé naturelle, même
 * index unique.
 */
export interface DbPlannedSession {
  userId: ObjectId;
  at: string;
  activity: string | null;
  event: PlannedEventRef | null;
  /** `at` plus `PLANNED_SESSION_GRACE_HOURS`. */
  expiresAt: string;
  updatedAt: string;
}

function plannedCollection() {
  return db.db().collection<DbPlannedSession>("plannedSessions");
}

function toPlanned(doc: DbPlannedSession): PlannedSession {
  return { at: doc.at, activity: doc.activity, event: doc.event };
}

async function getPlanned(userId: ObjectId): Promise<PlannedSession | null> {
  const doc = await plannedCollection().findOne({
    userId,
    expiresAt: { $gt: new Date().toISOString() },
  });
  return doc ? toPlanned(doc) : null;
}

/**
 * Une activité propre : sans espaces superflus, vide ramené à `null`.
 * `false` pour une valeur refusée — ni texte, ni `null`, ou trop longue.
 */
export function normalizeActivity(value: unknown): string | null | false {
  if (value === null) return null;
  if (typeof value !== "string") return false;

  const activity = value.replace(/\s+/g, " ").trim();
  if (activity.length > PRESENCE_ACTIVITY_MAX_LENGTH) return false;

  return activity || null;
}

function toMine(
  presence: DbPresence | null,
  planned: PlannedSession | null,
  now: Date,
): MyPresence {
  if (!presence || new Date(presence.expiresAt) <= now) {
    return {
      playing: false,
      activity: null,
      since: null,
      expiresAt: null,
      planned,
    };
  }

  return {
    playing: true,
    activity: presence.activity,
    since: presence.since,
    expiresAt: presence.expiresAt,
    planned,
  };
}

export async function getMyPresence(userId: ObjectId): Promise<MyPresence> {
  const [presence, planned] = await Promise.all([
    collection().findOne({ userId }, { projection: { _id: 0 } }),
    getPlanned(userId),
  ]);

  return toMine(presence, planned, new Date());
}

/**
 * Déclare jouer, ou renouvelle la déclaration.
 *
 * `since` ne bouge pas tant que la session court : changer d'activité, ou la
 * renouveler, n'est pas recommencer à jouer. Une déclaration déjà éteinte, en
 * revanche, ouvre une nouvelle session.
 *
 * `activity` absente (`undefined`) garde celle de la session en cours : un
 * simple renouvellement n'a pas à la répéter, ni surtout à l'effacer.
 *
 * Commencer une session consomme la session prévue : elle a eu lieu. Sans
 * activité précisée, la sienne est reprise. Un renouvellement n'y touche pas —
 * on peut jouer et avoir déjà prévu la suivante.
 */
export async function declarePlaying(
  userId: ObjectId,
  requested: string | null | undefined,
): Promise<MyPresence> {
  const now = new Date();
  const updatedAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + PRESENCE_TTL_HOURS * 3_600_000,
  ).toISOString();

  const [previous, planned] = await Promise.all([
    collection().findOne({ userId }),
    getPlanned(userId),
  ]);
  const running = previous && new Date(previous.expiresAt) > now;
  const since = running ? previous.since : updatedAt;
  const activity =
    requested === undefined
      ? running
        ? previous.activity
        : (planned?.activity ?? null)
      : requested;

  if (!running && planned) await plannedCollection().deleteOne({ userId });

  await collection().updateOne(
    { userId },
    {
      $set: { activity, since, updatedAt, expiresAt },
      $setOnInsert: { userId },
    },
    { upsert: true },
  );

  return {
    playing: true,
    activity,
    since,
    expiresAt,
    planned: running ? planned : null,
  };
}

/** Arrête de jouer ; la session prévue, s'il y en a une, reste. */
export async function stopPlaying(userId: ObjectId): Promise<MyPresence> {
  await collection().deleteOne({ userId });
  return toMine(null, await getPlanned(userId), new Date());
}

// ─── Session prévue ───────────────────────────────────────────────────────────

export type PlanOutcome =
  | { presence: MyPresence }
  | { error: string; status: 400 | 404 };

/**
 * Prévoit ma prochaine session, ou remplace celle déjà prévue.
 *
 * `body` : `{ at?, activity?, event?: { orgId, eventId } }`. Avec `event`, la
 * session reprend un évènement où je suis inscrit : son heure de début et son
 * titre, sauf `at` ou `activity` précisés. Sans, `at` est requis.
 */
export async function planSession(
  userId: ObjectId,
  body: unknown,
): Promise<PlanOutcome> {
  const input =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};

  let event: PlannedEventRef | null = null;
  let eventStart: string | null = null;
  if (input.event !== undefined && input.event !== null) {
    const ref = input.event as Record<string, unknown>;
    if (typeof ref.orgId !== "string" || typeof ref.eventId !== "string") {
      return {
        error: "`event` must be { orgId: string, eventId: string }",
        status: 400,
      };
    }
    const found = await findMyUpcomingEvent(
      userId.toString(),
      ref.orgId,
      ref.eventId,
    );
    if (!found) {
      return {
        error: "No upcoming event you are registered to",
        status: 404,
      };
    }
    event = { orgId: found.orgId, eventId: found.eventId, title: found.title };
    eventStart = found.startsAt;
  }

  const activity =
    input.activity === undefined
      ? (event?.title.slice(0, PRESENCE_ACTIVITY_MAX_LENGTH) ?? null)
      : normalizeActivity(input.activity);
  if (activity === false) {
    return {
      error: `\`activity\` must be a string of at most ${PRESENCE_ACTIVITY_MAX_LENGTH} characters`,
      status: 400,
    };
  }

  const rawAt = input.at ?? eventStart;
  const at = typeof rawAt === "string" ? new Date(rawAt) : null;
  const now = Date.now();
  if (!at || Number.isNaN(at.getTime())) {
    return { error: "`at` must be an ISO date", status: 400 };
  }
  // Un évènement déjà commencé se reprend encore : on arrive en retard.
  const earliest = now - PLANNED_SESSION_GRACE_HOURS * 3_600_000;
  if (
    at.getTime() <= earliest ||
    at.getTime() > now + PLANNED_SESSION_MAX_DAYS_AHEAD * 86_400_000
  ) {
    return {
      error: `\`at\` must be within the next ${PLANNED_SESSION_MAX_DAYS_AHEAD} days`,
      status: 400,
    };
  }

  const doc: Omit<DbPlannedSession, "userId"> = {
    at: at.toISOString(),
    activity,
    event,
    expiresAt: new Date(
      at.getTime() + PLANNED_SESSION_GRACE_HOURS * 3_600_000,
    ).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  await plannedCollection().updateOne(
    { userId },
    { $set: doc, $setOnInsert: { userId } },
    { upsert: true },
  );

  return { presence: await getMyPresence(userId) };
}

/** Annule ma session prévue. Idempotent. */
export async function cancelPlannedSession(
  userId: ObjectId,
): Promise<MyPresence> {
  await plannedCollection().deleteOne({ userId });
  return getMyPresence(userId);
}

/**
 * Qui, parmi `userIds`, a prévu une session encore à venir (ou en retard de
 * moins de `PLANNED_SESSION_GRACE_HOURS`), par identifiant.
 */
export async function plannedAmong(
  userIds: ObjectId[],
): Promise<Map<string, PlannedSession>> {
  if (userIds.length === 0) return new Map();

  const docs = await plannedCollection()
    .find({
      userId: { $in: userIds },
      expiresAt: { $gt: new Date().toISOString() },
    })
    .toArray();

  return new Map(docs.map((doc) => [doc.userId.toString(), toPlanned(doc)]));
}

/**
 * Qui, parmi `userIds`, est en jeu en ce moment : sa déclaration, par
 * identifiant. Ceux qui ne jouent pas n'y sont pas.
 */
export async function playingAmong(
  userIds: ObjectId[],
): Promise<Map<string, Pick<DbPresence, "activity" | "since">>> {
  if (userIds.length === 0) return new Map();

  const presences = await collection()
    .find(
      {
        userId: { $in: userIds },
        expiresAt: { $gt: new Date().toISOString() },
      },
      { projection: { _id: 0, userId: 1, activity: 1, since: 1 } },
    )
    .toArray();

  return new Map(
    presences.map((presence) => [
      presence.userId.toString(),
      { activity: presence.activity, since: presence.since },
    ]),
  );
}

/**
 * Les membres d'une organisation en train de jouer, du plus ancien en jeu au
 * plus récent.
 *
 * `null` quand l'organisation n'existe pas ou que le lecteur n'en est pas
 * membre : la présence ne se montre qu'entre membres, même dans une
 * organisation publique — dire qui joue en ce moment ne regarde qu'eux.
 */
export async function getOrgPresence(
  orgId: string,
  readerId: string,
): Promise<OrgPresence | null> {
  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId }, { projection: { members: 1 } });

  if (!org) return null;

  const members = org.members ?? [];
  const isMember = members.some((member) =>
    new ObjectId(member.userId).equals(readerId),
  );
  if (!isMember) return null;

  const memberIds = members.map((member) => new ObjectId(member.userId));
  const now = new Date().toISOString();

  const [presences, plannedById] = await Promise.all([
    collection()
      .find({ userId: { $in: memberIds }, expiresAt: { $gt: now } })
      .sort({ since: 1 })
      .toArray(),
    plannedAmong(memberIds),
  ]);

  const playingIds = new Set(
    presences.map((presence) => presence.userId.toString()),
  );
  // Qui joue déjà n'est plus « prévu » : il est là.
  const plannedEntries = [...plannedById].filter(([id]) => !playingIds.has(id));

  const shownIds = [
    ...presences.map((presence) => presence.userId),
    ...plannedEntries.map(([id]) => new ObjectId(id)),
  ];

  const users = shownIds.length
    ? await db
        .db()
        .collection<{
          _id: ObjectId;
          name?: string;
          avatar?: string;
          image?: string;
        }>("users")
        .find(
          { _id: { $in: shownIds } },
          { projection: { name: 1, avatar: 1, image: 1 } },
        )
        .toArray()
    : [];

  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const membersById = new Map(
    members.map((member) => [member.userId.toString(), member]),
  );

  const playing: MemberPresence[] = presences.map((presence) => {
    const id = presence.userId.toString();
    const user = usersById.get(id);
    const member = membersById.get(id);

    return {
      userId: id,
      name: user?.name ?? "Membre",
      avatar: user?.avatar ?? user?.image ?? null,
      rank: member?.rank || null,
      activity: presence.activity,
      since: presence.since,
    };
  });

  const planned: MemberPlanned[] = plannedEntries
    .map(([id, session]) => {
      const user = usersById.get(id);
      const member = membersById.get(id);
      return {
        userId: id,
        name: user?.name ?? "Membre",
        avatar: user?.avatar ?? user?.image ?? null,
        rank: member?.rank || null,
        planned: {
          ...session,
          // Le lien vers un évènement d'une autre orga ne mènerait nulle part.
          event: session.event?.orgId === orgId ? session.event : null,
        },
      };
    })
    .sort((a, b) => a.planned.at.localeCompare(b.planned.at));

  return { orgId, playing, planned, memberCount: members.length };
}
