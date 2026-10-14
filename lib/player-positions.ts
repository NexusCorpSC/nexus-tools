import "server-only";

import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { friendIdsOf } from "@/lib/friends";
import { organizations } from "@/lib/orgs";
import { PUBLIC_PLACES, normalizePlacePosition } from "@/lib/places";
import {
  declarePlaying,
  getMyPresence,
  playingAmong,
  PLAYER_POSITIONS_COLLECTION,
} from "@/lib/presence";
import type { Place, PlacePosition } from "@/types/places";
import {
  POSITION_TTL_MINUTES,
  isPositionSource,
  type MyPositionSharing,
  type PlayerInGame,
  type PlayerPosition,
  type PositionInput,
  type PositionSharing,
  type SharingOrg,
} from "@/types/player-positions";

/**
 * Le suivi de position (voir `types/player-positions.ts`).
 *
 * `positionSharing` garde le réglage de chacun (un document par joueur, gardé
 * quand il arrête de partager, pour retrouver ses cases cochées) ;
 * `playerPositions` sa dernière position, un document par joueur réécrit à
 * chaque relevé. Qui voit quoi se décide à la lecture : un ami si le joueur
 * partage avec ses amis, un membre d'une organisation cochée tant que le
 * joueur et lui en font partie tous les deux — et seulement pendant que le
 * joueur est en jeu.
 */

export class PlayerPositionError extends Error {
  constructor(
    public code: "invalidInput" | "notSharing",
    public status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

type DbSharing = {
  userId: ObjectId;
  enabled: boolean;
  friends: boolean;
  orgIds: string[];
  updatedAt: Date;
};

type DbPosition = {
  userId: ObjectId;
  systemSlug: string;
  systemName?: string;
  bodySlug?: string;
  bodyName?: string;
  position: PlacePosition;
  source: PlayerPosition["source"];
  at: Date;
  /** `at` plus `POSITION_TTL_MINUTES` : un index TTL fait le ménage. */
  expiresAt: Date;
};

const sharings = () => db.db().collection<DbSharing>("positionSharing");
const positions = () =>
  db.db().collection<DbPosition>(PLAYER_POSITIONS_COLLECTION);
const places = () => db.db().collection<Place>("gameLocations");

const OFF: PositionSharing = { enabled: false, friends: true, orgIds: [] };

function toPosition(doc: DbPosition): PlayerPosition {
  const result: PlayerPosition = {
    systemSlug: doc.systemSlug,
    position: doc.position,
    source: doc.source,
    at: doc.at.toISOString(),
  };
  if (doc.systemName) result.systemName = doc.systemName;
  if (doc.bodySlug) result.bodySlug = doc.bodySlug;
  if (doc.bodyName) result.bodyName = doc.bodyName;
  return result;
}

/** Mes organisations : celles que je peux cocher. */
async function myOrgs(userId: ObjectId): Promise<SharingOrg[]> {
  const found = await organizations()
    .find(
      { "members.userId": userId },
      { projection: { name: 1, tag: 1, "members.userId": 1 } },
    )
    .sort({ name: 1 })
    .toArray();
  return found.map((org) => {
    const result: SharingOrg = {
      id: String(org._id),
      name: org.name,
      members: org.members?.length ?? 0,
    };
    if (org.tag) result.tag = org.tag;
    return result;
  });
}

async function readSharing(userId: ObjectId): Promise<PositionSharing> {
  const doc = await sharings().findOne({ userId });
  return doc
    ? { enabled: doc.enabled, friends: doc.friends, orgIds: doc.orgIds }
    : OFF;
}

export async function getMyPositionSharing(
  userId: ObjectId,
): Promise<MyPositionSharing> {
  const [sharing, orgs, friendIds, presence, position] = await Promise.all([
    readSharing(userId),
    myOrgs(userId),
    friendIdsOf(userId),
    getMyPresence(userId),
    positions().findOne({ userId, expiresAt: { $gt: new Date() } }),
  ]);
  // Une organisation quittée n'est plus cochée, même si le réglage la garde.
  const mine = new Set(orgs.map((org) => org.id));
  return {
    sharing: {
      ...sharing,
      orgIds: sharing.orgIds.filter((id) => mine.has(id)),
    },
    orgs,
    friends: friendIds.length,
    playing: presence.playing,
    position:
      position && presence.playing && sharing.enabled
        ? toPosition(position)
        : null,
  };
}

/**
 * Change qui voit ma position. Activer le partage me déclare en jeu si je ne
 * l'étais pas ; le couper efface ma position.
 *
 * `raw` : `{ enabled?, friends?, orgIds? }` ; un champ absent garde sa valeur.
 */
export async function setMyPositionSharing(
  userId: ObjectId,
  raw: unknown,
): Promise<MyPositionSharing> {
  const input =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : null;
  if (!input) throw new PlayerPositionError("invalidInput", 400);
  const current = await readSharing(userId);
  const next: PositionSharing = { ...current };

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean")
      throw new PlayerPositionError("invalidInput", 400, "`enabled` invalide");
    next.enabled = input.enabled;
  }
  if (input.friends !== undefined) {
    if (typeof input.friends !== "boolean")
      throw new PlayerPositionError("invalidInput", 400, "`friends` invalide");
    next.friends = input.friends;
  }
  if (input.orgIds !== undefined) {
    if (
      !Array.isArray(input.orgIds) ||
      !input.orgIds.every((id) => typeof id === "string")
    )
      throw new PlayerPositionError("invalidInput", 400, "`orgIds` invalide");
    const mine = new Set((await myOrgs(userId)).map((org) => org.id));
    next.orgIds = [...new Set(input.orgIds as string[])].filter((id) =>
      mine.has(id),
    );
  }

  await sharings().updateOne(
    { userId },
    { $set: { ...next, updatedAt: new Date() }, $setOnInsert: { userId } },
    { upsert: true },
  );

  if (!next.enabled) {
    await positions().deleteOne({ userId });
  } else if (!current.enabled && !(await getMyPresence(userId)).playing) {
    await declarePlaying(userId, undefined);
  }

  return getMyPositionSharing(userId);
}

/**
 * La position et ce qui la situe : sur un corps, le système est le sien ;
 * dans l'espace, le système doit être donné. Comme les marqueurs.
 */
async function locate(
  raw: PositionInput,
): Promise<
  Pick<
    DbPosition,
    "position" | "systemSlug" | "systemName" | "bodySlug" | "bodyName"
  >
> {
  let position: PlacePosition | undefined;
  try {
    position = normalizePlacePosition(raw.position);
  } catch {
    position = undefined;
  }
  if (!position) {
    throw new PlayerPositionError("invalidInput", 400, "Position invalide");
  }
  if (position.body) {
    const body = await places().findOne(
      { slug: position.body, celestial: { $exists: true }, ...PUBLIC_PLACES },
      { projection: { name: 1, systemSlug: 1, systemName: 1 } },
    );
    if (!body?.systemSlug) {
      throw new PlayerPositionError(
        "invalidInput",
        400,
        "Corps céleste inconnu",
      );
    }
    const located: Awaited<ReturnType<typeof locate>> = {
      position,
      systemSlug: body.systemSlug,
      bodySlug: position.body,
      bodyName: body.name,
    };
    if (body.systemName) located.systemName = body.systemName;
    return located;
  }
  const system =
    typeof raw.systemSlug === "string" && raw.systemSlug
      ? await places().findOne(
          { slug: raw.systemSlug, type: "star", ...PUBLIC_PLACES },
          { projection: { slug: 1, name: 1 } },
        )
      : null;
  if (!system) {
    throw new PlayerPositionError("invalidInput", 400, "Système inconnu");
  }
  return { position, systemSlug: system.slug, systemName: system.name };
}

/**
 * Enregistre ma position. Il faut partager ; ne pas être en jeu me déclare
 * en jeu, comme activer le partage.
 */
export async function reportMyPosition(
  userId: ObjectId,
  raw: unknown,
): Promise<PlayerPosition> {
  if (raw === null || typeof raw !== "object") {
    throw new PlayerPositionError("invalidInput", 400);
  }
  const input = raw as PositionInput;
  const source = input.source ?? "paste";
  if (!isPositionSource(source)) {
    throw new PlayerPositionError("invalidInput", 400, "`source` invalide");
  }
  const [sharing, located, presence] = await Promise.all([
    readSharing(userId),
    locate(input),
    getMyPresence(userId),
  ]);
  if (!sharing.enabled) throw new PlayerPositionError("notSharing", 409);
  if (!presence.playing) await declarePlaying(userId, undefined);

  const at = new Date();
  const doc: Omit<DbPosition, "userId"> = {
    ...located,
    source,
    at,
    expiresAt: new Date(at.getTime() + POSITION_TTL_MINUTES * 60_000),
  };
  await positions().replaceOne(
    { userId },
    { userId, ...doc },
    { upsert: true },
  );
  return toPosition({ userId, ...doc });
}

/** Efface ma position, sans toucher au réglage. Idempotent. */
export async function clearMyPosition(userId: ObjectId): Promise<void> {
  await positions().deleteOne({ userId });
}

/**
 * Les joueurs en jeu dont je vois la position, moi compris si je partage :
 * du relevé le plus récent au plus ancien.
 */
export async function visiblePlayers(
  readerId: ObjectId,
): Promise<PlayerInGame[]> {
  const [friendIds, readerOrgs] = await Promise.all([
    friendIdsOf(readerId),
    organizations()
      .find(
        { "members.userId": readerId },
        { projection: { name: 1, tag: 1, "members.userId": 1 } },
      )
      .toArray(),
  ]);
  const friends = new Set(friendIds);
  const reader = readerId.toHexString();

  const candidates = await sharings()
    .find({
      enabled: true,
      $or: [
        { userId: readerId },
        {
          friends: true,
          userId: { $in: friendIds.map((id) => new ObjectId(id)) },
        },
        { orgIds: { $in: readerOrgs.map((org) => String(org._id)) } },
      ],
    })
    .toArray();

  // Par quelles organisations je vois chacun : cochées par lui, et dont nous
  // sommes membres tous les deux.
  const seen = new Map<
    string,
    { friend: boolean; orgs: PlayerInGame["orgs"]; me: boolean }
  >();
  for (const sharing of candidates) {
    const id = sharing.userId.toHexString();
    const me = id === reader;
    const friend = friends.has(id);
    const orgs = readerOrgs
      .filter(
        (org) =>
          sharing.orgIds.includes(String(org._id)) &&
          (org.members ?? []).some((member) =>
            member.userId.equals(sharing.userId),
          ),
      )
      .map((org) => {
        const shown: PlayerInGame["orgs"][number] = {
          id: String(org._id),
          name: org.name,
        };
        if (org.tag) shown.tag = org.tag;
        return shown;
      });
    // Moi : ni ami ni membre, ma propre position.
    if (me) seen.set(id, { friend: false, orgs: [], me });
    else if ((friend && sharing.friends) || orgs.length > 0) {
      seen.set(id, { friend: friend && sharing.friends, orgs, me });
    }
  }
  if (seen.size === 0) return [];

  const ids = [...seen.keys()].map((id) => new ObjectId(id));
  const [found, playing, users] = await Promise.all([
    positions()
      .find({ userId: { $in: ids }, expiresAt: { $gt: new Date() } })
      .sort({ at: -1 })
      .toArray(),
    playingAmong(ids),
    db
      .db()
      .collection<{
        _id: ObjectId;
        name?: string;
        avatar?: string;
        image?: string;
      }>("users")
      .find(
        { _id: { $in: ids } },
        { projection: { name: 1, avatar: 1, image: 1 } },
      )
      .toArray(),
  ]);
  const usersById = new Map(
    users.map((user) => [user._id.toHexString(), user]),
  );

  const result: PlayerInGame[] = [];
  for (const doc of found) {
    const id = doc.userId.toHexString();
    const presence = playing.get(id);
    const how = seen.get(id);
    // Seuls ceux qui sont en jeu en ce moment.
    if (!presence || !how) continue;
    const user = usersById.get(id);
    result.push({
      ...toPosition(doc),
      userId: id,
      name: user?.name ?? "Joueur",
      avatar: user?.avatar ?? user?.image ?? null,
      me: how.me,
      friend: how.friend,
      orgs: how.orgs,
      activity: presence.activity,
      since: presence.since,
    });
  }
  return result;
}
