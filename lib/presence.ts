import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import type { Organization } from "@/app/orgs/page";
import {
  NOT_PLAYING,
  PRESENCE_ACTIVITY_MAX_LENGTH,
  PRESENCE_TTL_HOURS,
  type MemberPresence,
  type MyPresence,
  type OrgPresence,
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

function toMine(presence: DbPresence | null, now: Date): MyPresence {
  if (!presence || new Date(presence.expiresAt) <= now) return NOT_PLAYING;

  return {
    playing: true,
    activity: presence.activity,
    since: presence.since,
    expiresAt: presence.expiresAt,
  };
}

export async function getMyPresence(userId: ObjectId): Promise<MyPresence> {
  const presence = await collection().findOne(
    { userId },
    { projection: { _id: 0 } },
  );

  return toMine(presence, new Date());
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

  const previous = await collection().findOne({ userId });
  const running = previous && new Date(previous.expiresAt) > now;
  const since = running ? previous.since : updatedAt;
  const activity =
    requested === undefined ? (running ? previous.activity : null) : requested;

  await collection().updateOne(
    { userId },
    {
      $set: { activity, since, updatedAt, expiresAt },
      $setOnInsert: { userId },
    },
    { upsert: true },
  );

  return { playing: true, activity, since, expiresAt };
}

export async function stopPlaying(userId: ObjectId): Promise<MyPresence> {
  await collection().deleteOne({ userId });
  return NOT_PLAYING;
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

  const presences = await collection()
    .find({ userId: { $in: memberIds }, expiresAt: { $gt: now } })
    .sort({ since: 1 })
    .toArray();

  const users = presences.length
    ? await db
        .db()
        .collection<{
          _id: ObjectId;
          name?: string;
          avatar?: string;
          image?: string;
        }>("users")
        .find(
          { _id: { $in: presences.map((presence) => presence.userId) } },
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

  return { orgId, playing, memberCount: members.length };
}
