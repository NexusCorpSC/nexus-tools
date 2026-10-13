import "server-only";

import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { duplicateOf, newCode } from "@/lib/join-codes";
import { friendIdsOf } from "@/lib/friends";
import {
  MAX_INVITES_PER_DAY,
  MAX_SHARES_PER_TARGET,
  SHARE_LINK_TOKEN_LENGTH,
  type ShareCandidate,
  type ShareKind,
  type ShareEntry,
  type ShareVia,
} from "@/types/shares";

/**
 * Le partage avec des joueurs précis, commun à tout ce qui se partage : les
 * lieux privés, les évènements, et ce qui viendra (les marqueurs). Chaque type
 * garde ses propres règles de lecture (créateur, organisation, public) ; le
 * partage y ajoute « et aussi ces joueurs » et, quand le type le permet, « et
 * aussi ceux qui ont ce lien ».
 *
 * `shares` : une ligne par joueur et par objet partagé, unique sur
 * `{ kind, targetId, userId }`. `via` dit comment il y est entré : invité par
 * quelqu'un, ou venu par le lien de partage en étant connecté — ce qui lui
 * garde l'objet dans ses listes.
 *
 * `shareLinks` : les liens de partage, au plus un actif par objet. Un lien
 * désactivé garde sa ligne (`revokedAt`) pour qu'une adresse qui circule
 * encore dise « ce lien n'est plus actif » plutôt que « introuvable ».
 *
 * Ce module ne sait pas ce qu'est un évènement ni un lieu : qui a le droit de
 * partager, et ce que l'objet s'appelle, c'est `lib/share-targets.ts`.
 */

export interface DbShare {
  _id: ObjectId;
  kind: ShareKind;
  targetId: string;
  userId: string;
  via: ShareVia;
  /** Qui l'a invité ; `null` pour une entrée par le lien. */
  invitedBy: string | null;
  createdAt: Date;
  /** Vue dans la cloche, ou l'objet ouvert : n'est plus « nouvelle ». */
  seenAt?: Date;
}

export interface DbShareLink {
  _id: ObjectId;
  kind: ShareKind;
  targetId: string;
  token: string;
  createdBy: string;
  createdAt: Date;
  revokedAt?: Date;
}

export class ShareError extends Error {
  constructor(
    public code:
      | "notFound"
      | "forbidden"
      | "invalidInput"
      | "self"
      | "userNotFound"
      | "tooManyShares"
      | "tooManyInvites"
      | "noLink",
    public status: number,
  ) {
    super(code);
  }
}

export const shares = () => db.db().collection<DbShare>("shares");
export const shareLinks = () => db.db().collection<DbShareLink>("shareLinks");
const users = () =>
  db
    .db()
    .collection<{ _id: ObjectId; name?: string; avatar?: string; image?: string }>(
      "users",
    );

// ─── Lecture ───────────────────────────────────────────────────────────────

/** Comment `userId` a accès à cet objet par le partage ; `null` s'il ne l'a pas. */
export async function shareOf(
  kind: ShareKind,
  targetId: string,
  userId: string | null,
): Promise<DbShare | null> {
  if (!userId) return null;
  return shares().findOne({ kind, targetId, userId });
}

/** Les objets de ce type partagés avec `userId`. */
export async function sharedWith(
  kind: ShareKind,
  userId: string,
): Promise<DbShare[]> {
  return shares()
    .find({ kind, userId })
    .sort({ createdAt: -1 })
    .limit(1_000)
    .toArray();
}

/** Combien de joueurs ont chacun de ces objets par le partage. */
export async function shareCounts(
  kind: ShareKind,
  targetIds: string[],
): Promise<Map<string, number>> {
  if (targetIds.length === 0) return new Map();
  const counts = await shares()
    .aggregate<{ _id: string; count: number }>([
      { $match: { kind, targetId: { $in: targetIds } } },
      { $group: { _id: "$targetId", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(counts.map((entry) => [entry._id, entry.count]));
}

type UserCard = { name: string; avatar: string | null };

export async function userCards(
  ids: string[],
): Promise<Map<string, UserCard>> {
  const valid = [...new Set(ids)].filter((id) => ObjectId.isValid(id));
  if (valid.length === 0) return new Map();
  const found = await users()
    .find(
      { _id: { $in: valid.map((id) => new ObjectId(id)) } },
      { projection: { name: 1, avatar: 1, image: 1 } },
    )
    .toArray();
  return new Map(
    found.map((user) => [
      String(user._id),
      {
        name: user.name ?? "Sans nom",
        avatar: user.avatar ?? user.image ?? null,
      },
    ]),
  );
}

/** Qui a cet objet par le partage, le plus récent d'abord. */
export async function listShares(
  kind: ShareKind,
  targetId: string,
): Promise<ShareEntry[]> {
  const found = await shares()
    .find({ kind, targetId })
    .sort({ createdAt: -1 })
    .limit(MAX_SHARES_PER_TARGET * 2)
    .toArray();
  const cards = await userCards(
    found.flatMap((share) =>
      share.invitedBy ? [share.userId, share.invitedBy] : [share.userId],
    ),
  );
  return found.map((share) => ({
    userId: share.userId,
    name: cards.get(share.userId)?.name ?? "Sans nom",
    avatar: cards.get(share.userId)?.avatar ?? null,
    via: share.via,
    invitedByName: share.invitedBy
      ? (cards.get(share.invitedBy)?.name ?? null)
      : null,
    createdAt: share.createdAt.toISOString(),
    seen: !!share.seenAt,
  }));
}

// ─── Invitations ───────────────────────────────────────────────────────────

/**
 * Invite `userId`. Idempotent : déjà invité, rien ne change ; venu par le
 * lien, il devient invité — il garde l'accès même si le lien est désactivé.
 */
export async function inviteToShare(
  kind: ShareKind,
  targetId: string,
  inviterId: string,
  userId: unknown,
): Promise<void> {
  if (typeof userId !== "string" || !ObjectId.isValid(userId)) {
    throw new ShareError("invalidInput", 400);
  }
  if (userId === inviterId) throw new ShareError("self", 400);
  const exists = await users().countDocuments(
    { _id: new ObjectId(userId) },
    { limit: 1 },
  );
  if (!exists) throw new ShareError("userNotFound", 404);

  const current = await shares().findOne({ kind, targetId, userId });
  if (current?.via === "invite") return;

  if (!current) {
    const [count, today] = await Promise.all([
      shares().countDocuments({ kind, targetId }),
      shares().countDocuments({
        invitedBy: inviterId,
        createdAt: { $gt: new Date(Date.now() - 86_400_000) },
      }),
    ]);
    if (count >= MAX_SHARES_PER_TARGET) {
      throw new ShareError("tooManyShares", 409);
    }
    if (today >= MAX_INVITES_PER_DAY) {
      throw new ShareError("tooManyInvites", 429);
    }
  }

  try {
    await shares().updateOne(
      { kind, targetId, userId },
      {
        $set: { via: "invite", invitedBy: inviterId, createdAt: new Date() },
        $unset: { seenAt: "" },
      },
      { upsert: true },
    );
  } catch (error) {
    // Deux invitations simultanées : la première a gagné, c'est la même.
    if (duplicateOf(error) === null) throw error;
  }
}

/** Retire l'accès d'un joueur. `false` s'il ne l'avait pas. */
export async function removeShare(
  kind: ShareKind,
  targetId: string,
  userId: string,
): Promise<boolean> {
  const removed = await shares().deleteOne({ kind, targetId, userId });
  return removed.deletedCount === 1;
}

/** L'objet supprimé ou devenu public : plus rien à partager. */
export async function forgetTarget(
  kind: ShareKind,
  targetId: string,
): Promise<void> {
  await Promise.all([
    shares().deleteMany({ kind, targetId }),
    shareLinks().deleteMany({ kind, targetId }),
  ]);
}

/** Les invitations reçues, la plus récente d'abord : la cloche. */
export async function myInvitations(
  userId: string,
  limit = 20,
): Promise<{ shares: DbShare[]; unseen: number }> {
  const filter = { userId, via: "invite" as const };
  const [found, unseen] = await Promise.all([
    shares().find(filter).sort({ createdAt: -1 }).limit(limit).toArray(),
    shares().countDocuments({ ...filter, seenAt: { $exists: false } }),
  ]);
  return { shares: found, unseen };
}

/** Combien d'invitations attendent d'être vues : le chiffre sur la cloche. */
export async function countUnseenInvitations(userId: string): Promise<number> {
  return shares().countDocuments({
    userId,
    via: "invite",
    seenAt: { $exists: false },
  });
}

/** Tout est vu, ou seulement cet objet quand il est ouvert. */
export async function markInvitationsSeen(
  userId: string,
  target?: { kind: ShareKind; targetId: string },
): Promise<void> {
  await shares().updateMany(
    { userId, seenAt: { $exists: false }, ...(target ?? {}) },
    { $set: { seenAt: new Date() } },
  );
}

// ─── Lien de partage ───────────────────────────────────────────────────────

export async function activeLink(
  kind: ShareKind,
  targetId: string,
): Promise<DbShareLink | null> {
  return shareLinks().findOne({
    kind,
    targetId,
    revokedAt: { $exists: false },
  });
}

/** Le lien d'une adresse, actif ou non ; `null` s'il n'a jamais existé. */
export async function linkByToken(token: string): Promise<DbShareLink | null> {
  const normalized = token.trim().toUpperCase();
  if (normalized.length !== SHARE_LINK_TOKEN_LENGTH) return null;
  return shareLinks().findOne({ token: normalized });
}

/**
 * Désactive le lien actif. Ceux qui sont venus par lui perdent l'accès, sauf
 * ceux que `keep` retient (les inscrits à l'évènement).
 */
export async function revokeLink(
  kind: ShareKind,
  targetId: string,
  keep: string[] = [],
): Promise<void> {
  await shareLinks().updateMany(
    { kind, targetId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  await shares().deleteMany({
    kind,
    targetId,
    via: "link",
    userId: { $nin: keep },
  });
}

/**
 * Un nouveau lien : l'ancien est désactivé comme par `revokeLink`, et une
 * autre adresse prend sa place.
 */
export async function createLink(
  kind: ShareKind,
  targetId: string,
  userId: string,
  keep: string[] = [],
): Promise<DbShareLink> {
  await revokeLink(kind, targetId, keep);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const link: DbShareLink = {
      _id: new ObjectId(),
      kind,
      targetId,
      token: newCode(SHARE_LINK_TOKEN_LENGTH),
      createdBy: userId,
      createdAt: new Date(),
    };
    try {
      await shareLinks().insertOne(link);
      return link;
    } catch (error) {
      if (duplicateOf(error) === null) throw error;
    }
  }
  throw new Error("Aucun jeton de lien libre");
}

/**
 * Un joueur connecté ouvre le lien : il garde l'objet dans ses listes. Rien ne
 * change s'il y avait déjà accès par le partage.
 */
export async function recordLinkVisit(
  kind: ShareKind,
  targetId: string,
  userId: string,
): Promise<void> {
  try {
    await shares().updateOne(
      { kind, targetId, userId },
      {
        $setOnInsert: {
          via: "link",
          invitedBy: null,
          createdAt: new Date(),
          seenAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (duplicateOf(error) === null) throw error;
  }
}

// ─── Qui inviter ───────────────────────────────────────────────────────────

const MAX_CANDIDATES = 8;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Les joueurs à inviter dont le pseudo commence par `query` : ses amis
 * d'abord, puis les autres. Sans `query`, ses amis seulement.
 */
export async function searchShareCandidates(
  userId: string,
  query: string,
  target?: { kind: ShareKind; targetId: string },
): Promise<ShareCandidate[]> {
  const friendIds = ObjectId.isValid(userId)
    ? await friendIdsOf(new ObjectId(userId))
    : [];
  const text = query.trim().slice(0, 40);
  const matcher = text
    ? { name: { $regex: `^${escapeRegex(text)}`, $options: "i" } }
    : {};
  const projection = { name: 1, avatar: 1, image: 1 };
  const friendOids = friendIds.map((id) => new ObjectId(id));
  const friends = friendOids.length
    ? await users()
        .find({ _id: { $in: friendOids }, ...matcher }, { projection })
        .sort({ name: 1 })
        .limit(MAX_CANDIDATES)
        .toArray()
    : [];
  const others =
    text && friends.length < MAX_CANDIDATES
      ? await users()
          .find(
            {
              _id: {
                $nin: [
                  ...friendOids,
                  ...(ObjectId.isValid(userId) ? [new ObjectId(userId)] : []),
                ],
              },
              ...matcher,
            },
            { projection },
          )
          .sort({ name: 1 })
          .limit(MAX_CANDIDATES - friends.length)
          .toArray()
      : [];
  const found = [...friends, ...others];
  const holders = target
    ? new Set(
        (
          await shares()
            .find(
              {
                ...target,
                userId: { $in: found.map((user) => String(user._id)) },
              },
              { projection: { userId: 1 } },
            )
            .toArray()
        ).map((share) => share.userId),
      )
    : new Set<string>();
  const friendSet = new Set(friendIds);
  return found.map((user) => ({
    userId: String(user._id),
    name: user.name ?? "Sans nom",
    avatar: user.avatar ?? user.image ?? null,
    isFriend: friendSet.has(String(user._id)),
    hasAccess: holders.has(String(user._id)),
  }));
}
