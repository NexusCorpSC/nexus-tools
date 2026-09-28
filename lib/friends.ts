import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { CODE_ALPHABET, CODE_ATTEMPTS, newCode } from "@/lib/join-codes";
import { playingAmong } from "@/lib/presence";
import {
  FRIEND_CODE_LENGTH,
  type Friend,
  type FriendErrorCode,
} from "@/types/friends";

/**
 * Les amis : une relation réciproque, née d'un code à usage unique.
 *
 * Chaque joueur a au plus un code en attente (`friendCodes`, un document par
 * joueur). Le demander à nouveau rend le même tant qu'il n'a pas servi. Le
 * saisir le consomme — supprimé d'un `findOneAndDelete`, si bien que deux
 * saisies simultanées ne peuvent pas s'en servir toutes les deux — et crée
 * l'amitié (`friendships`), un document par paire.
 */

/**
 * Codes faux qu'un joueur peut saisir dans `ATTEMPT_WINDOW_MS` avant d'attendre :
 * assez pour les fautes de frappe, bien trop peu pour deviner un code parmi
 * 32⁸ ≈ 10¹².
 */
const MAX_FAILED_ATTEMPTS = 10;
export const FRIEND_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

interface DbFriendCode {
  userId: ObjectId;
  code: string;
  createdAt: Date;
}

/**
 * `users` est la paire, triée : la requête « mes amis » cherche l'un des deux.
 * `pair` en est la clé unique, qui tient la règle d'une amitié par paire même
 * quand deux codes croisés sont saisis en même temps.
 */
interface DbFriendship {
  users: [ObjectId, ObjectId];
  pair: string;
  createdAt: Date;
}

interface DbUser {
  _id: ObjectId;
  name?: string;
  avatar?: string;
  image?: string;
}

export class FriendError extends Error {
  constructor(
    readonly code: FriendErrorCode,
    readonly status: number,
  ) {
    super(code);
  }

  toJSON() {
    return { error: this.code };
  }
}

const codes = () => db.db().collection<DbFriendCode>("friendCodes");
const friendships = () => db.db().collection<DbFriendship>("friendships");
const attempts = () =>
  db.db().collection<{ userId: ObjectId; at: Date }>("friendCodeAttempts");
const users = () => db.db().collection<DbUser>("users");

function pairOf(
  a: ObjectId,
  b: ObjectId,
): {
  users: [ObjectId, ObjectId];
  pair: string;
} {
  const [first, second] = [a, b].sort((x, y) =>
    x.toHexString().localeCompare(y.toHexString()),
  );
  return {
    users: [first, second],
    pair: `${first.toHexString()}:${second.toHexString()}`,
  };
}

/**
 * Un code tel que tapé ou collé — minuscules, « K7QD-92PX », espaces — sous la
 * forme où il est rangé, ou `null` quand il ne peut pas en être un.
 */
export function normalizeFriendCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== FRIEND_CODE_LENGTH) return null;
  return [...code].every((char) => CODE_ALPHABET.includes(char)) ? code : null;
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

// ─── Code ami ─────────────────────────────────────────────────────────────────

export async function getMyFriendCode(
  userId: ObjectId,
): Promise<string | null> {
  const found = await codes().findOne({ userId }, { projection: { code: 1 } });
  return found?.code ?? null;
}

/**
 * Le code en attente du joueur, créé s'il n'en a pas. Deux demandes
 * simultanées rendent le même : la seconde bute sur l'index unique de
 * `userId` et relit celui de la première.
 */
export async function getOrCreateFriendCode(userId: ObjectId): Promise<string> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const existing = await getMyFriendCode(userId);
    if (existing) return existing;

    const code = newCode(FRIEND_CODE_LENGTH);
    try {
      await codes().insertOne({ userId, code, createdAt: new Date() });
      return code;
    } catch (error) {
      // Soit une demande concurrente a déjà créé le code du joueur — relu au
      // tour suivant —, soit ce code est pris : un autre est tiré.
      if (!isDuplicateKey(error)) throw error;
    }
  }

  throw new Error("No free friend code found");
}

// ─── Ajout ────────────────────────────────────────────────────────────────────

/** Écarte un joueur qui s'est trompé de code trop souvent ces derniers temps. */
async function guardAttempts(userId: ObjectId) {
  const failed = await attempts().countDocuments({
    userId,
    at: { $gte: new Date(Date.now() - FRIEND_ATTEMPT_WINDOW_MS) },
  });
  if (failed >= MAX_FAILED_ATTEMPTS) {
    throw new FriendError("too_many_attempts", 429);
  }
}

async function recordFailure(userId: ObjectId) {
  await attempts().insertOne({ userId, at: new Date() });
}

/**
 * Devient ami avec le propriétaire du code, qui disparaît. Rend le nouvel ami,
 * tel que la liste le montre.
 *
 * Son propre code, ou celui d'un ami déjà ajouté, est refusé sans être
 * consommé : il reste valable pour quelqu'un d'autre.
 */
export async function addFriendByCode(
  readerId: ObjectId,
  rawCode: unknown,
): Promise<Friend> {
  await guardAttempts(readerId);

  const code = normalizeFriendCode(rawCode);
  if (!code) {
    await recordFailure(readerId);
    throw new FriendError("invalid_code", 400);
  }

  const found = await codes().findOne({ code });
  if (!found) {
    await recordFailure(readerId);
    throw new FriendError("not_found", 404);
  }
  if (found.userId.equals(readerId)) throw new FriendError("own_code", 400);

  const pair = pairOf(readerId, found.userId);
  if (
    await friendships().findOne({ pair: pair.pair }, { projection: { _id: 1 } })
  ) {
    throw new FriendError("already_friends", 409);
  }

  // Le code est pris à qui le saisit en premier ; l'autre le trouve disparu.
  const claimed = await codes().findOneAndDelete({
    code,
    userId: found.userId,
  });
  if (!claimed) throw new FriendError("not_found", 404);

  const createdAt = new Date();
  try {
    await friendships().insertOne({ ...pair, createdAt });
  } catch (error) {
    // Les deux se sont ajoutés en même temps, chacun avec le code de l'autre.
    if (isDuplicateKey(error)) throw new FriendError("already_friends", 409);
    throw error;
  }

  const [friend] = await describe(readerId, [
    { userId: found.userId, createdAt },
  ]);
  return friend;
}

// ─── Liste ────────────────────────────────────────────────────────────────────

/**
 * Les amis vus par `readerId` : nom, avatar, organisation partagée et, pour
 * ceux en jeu, leur déclaration.
 */
async function describe(
  readerId: ObjectId,
  entries: { userId: ObjectId; createdAt: Date }[],
): Promise<Friend[]> {
  if (entries.length === 0) return [];
  const ids = entries.map((entry) => entry.userId);

  const [found, playing, orgs] = await Promise.all([
    users()
      .find(
        { _id: { $in: ids } },
        { projection: { name: 1, avatar: 1, image: 1 } },
      )
      .toArray(),
    playingAmong(ids),
    db
      .db()
      .collection<{ name: string; members?: { userId: ObjectId }[] }>(
        "organizations",
      )
      .find(
        { "members.userId": readerId },
        { projection: { name: 1, "members.userId": 1 } },
      )
      .sort({ name: 1 })
      .toArray(),
  ]);

  const usersById = new Map(found.map((user) => [user._id.toString(), user]));

  const sharedOrg = new Map<string, string>();
  for (const org of orgs) {
    for (const member of org.members ?? []) {
      const id = member.userId.toString();
      if (!sharedOrg.has(id)) sharedOrg.set(id, org.name);
    }
  }

  return entries.map(({ userId, createdAt }) => {
    const id = userId.toString();
    const user = usersById.get(id);
    const presence = playing.get(id);

    return {
      userId: id,
      name: user?.name || "Joueur",
      avatar: user?.avatar ?? user?.image ?? null,
      sharedOrg: sharedOrg.get(id) ?? null,
      friendsSince: createdAt.toISOString(),
      playing: presence
        ? { activity: presence.activity, since: presence.since }
        : null,
    };
  });
}

/** En jeu d'abord, du plus ancien en jeu au plus récent ; puis les autres par nom. */
function byPresenceThenName(a: Friend, b: Friend): number {
  if (a.playing && b.playing)
    return a.playing.since.localeCompare(b.playing.since);
  if (a.playing) return -1;
  if (b.playing) return 1;
  return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
}

async function friendEntries(readerId: ObjectId) {
  const found = await friendships()
    .find({ users: readerId }, { projection: { users: 1, createdAt: 1 } })
    .toArray();

  return found.map((friendship) => ({
    userId: friendship.users[0].equals(readerId)
      ? friendship.users[1]
      : friendship.users[0],
    createdAt: friendship.createdAt,
  }));
}

export async function listFriends(readerId: ObjectId): Promise<Friend[]> {
  const friends = await describe(readerId, await friendEntries(readerId));
  return friends.sort(byPresenceThenName);
}

/** Combien d'amis sont en jeu, pour la barre du haut : une lecture légère. */
export async function countFriendsPlaying(readerId: ObjectId): Promise<number> {
  const entries = await friendEntries(readerId);
  const playing = await playingAmong(entries.map((entry) => entry.userId));
  return playing.size;
}

// ─── Retrait ──────────────────────────────────────────────────────────────────

/**
 * Retire l'amitié, des deux côtés. `false` quand il n'y en avait pas — un
 * identifiant malformé compris.
 */
export async function removeFriend(
  readerId: ObjectId,
  friendId: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{24}$/i.test(friendId)) return false;
  const { pair } = pairOf(readerId, new ObjectId(friendId));
  const removed = await friendships().deleteOne({ pair });
  return removed.deletedCount === 1;
}
