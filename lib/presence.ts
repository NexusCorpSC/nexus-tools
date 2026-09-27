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

/** Une activité propre : sans espaces superflus, vide ramené à `null`. */
export function normalizeActivity(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;

  const activity = value.replace(/\s+/g, " ").trim();
  if (activity.length > PRESENCE_ACTIVITY_MAX_LENGTH) return undefined;

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
 */
export async function declarePlaying(
  userId: ObjectId,
  activity: string | null,
): Promise<MyPresence> {
  const now = new Date();
  const updatedAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + PRESENCE_TTL_HOURS * 3_600_000,
  ).toISOString();

  const previous = await collection().findOne({ userId });
  const running = previous && new Date(previous.expiresAt) > now;
  const since = running ? previous.since : updatedAt;

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
        .collection<{ _id: ObjectId; name?: string; avatar?: string; image?: string }>(
          "users",
        )
        .find(
          { _id: { $in: presences.map((presence) => presence.userId) } },
          { projection: { name: 1, avatar: 1, image: 1 } },
        )
        .toArray()
    : [];

  const playing: MemberPresence[] = presences.map((presence) => {
    const user = users.find((one) => one._id.equals(presence.userId));
    const member = members.find((one) =>
      new ObjectId(one.userId).equals(presence.userId),
    );

    return {
      userId: presence.userId.toString(),
      name: user?.name ?? "Membre",
      avatar: user?.avatar ?? user?.image ?? null,
      rank: member?.rank || null,
      activity: presence.activity,
      since: presence.since,
    };
  });

  return { orgId, playing, memberCount: members.length };
}
