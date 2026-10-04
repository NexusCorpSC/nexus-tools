import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { evaluateAchievements } from "@/lib/achievements";
import {
  cleanText,
  contributions,
  pointEvents,
  users,
  type Contributor,
  type DbUser,
} from "@/lib/contribution-store";
import { getStanding, refreshProgress } from "@/lib/contributions";
import { logModeration, reports } from "@/lib/reports";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";
import { LEVELS, levelForPoints } from "@/types/contributions";
import {
  CREDITS_SHOWN,
  LEADERBOARD_SIZE,
  MAX_ADJUST_POINTS,
  MAX_ADJUST_REASON_LENGTH,
  MAX_SUSPENSION_DAYS,
  type Achievement,
  type ContribEvent,
  type ContributorErrorCode,
  type ContributorRow,
  type FicheCredits,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardScope,
} from "@/types/gamification";

/**
 * Ce que la communauté voit des contributions : le niveau à côté d'un pseudo,
 * les crédits d'une fiche, le classement ; et ce que l'admin règle à la main
 * sur un contributeur.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const LEVEL_PROJECTION = {
  name: 1,
  isAdmin: 1,
  permissions: 1,
  "contrib.points": 1,
  "contrib.level": 1,
  "contrib.trustLevel": 1,
} as const;

type LevelFields = Pick<DbUser, "isAdmin" | "permissions" | "contrib">;

/**
 * Le niveau à afficher à côté d'un pseudo, sans relire ses contributions : un
 * niveau fixé par un admin, sinon celui du dernier recalcul, sinon ce que
 * valent ses points.
 */
export function displayLevel(user: LevelFields | null | undefined): number {
  const trust = user?.contrib?.trustLevel;
  if (typeof trust === "number" && trust >= 1 && trust <= 5) {
    return Math.floor(trust);
  }
  if (
    user?.isAdmin === true ||
    user?.permissions?.includes(PLACES_EDIT_PERMISSION) ||
    user?.permissions?.includes(ITEMS_EDIT_PERMISSION)
  ) {
    return 5;
  }
  return (
    user?.contrib?.level ?? levelForPoints(user?.contrib?.points ?? 0).level
  );
}

/** Le pastille de l'en-tête : niveau et points du lecteur. */
export async function getMyBadge(
  userId: ObjectId,
): Promise<{ level: number; points: number }> {
  const user = await users().findOne(
    { _id: userId },
    { projection: LEVEL_PROJECTION },
  );
  return {
    level: displayLevel(user),
    points: user?.contrib?.points ?? 0,
  };
}

// ─── Crédits ────────────────────────────────────────────────────────────────

/**
 * « Fiche enrichie par » : qui a publié sur cette fiche, le plus actif
 * d'abord. Lu des contributions publiées plutôt que tenu sur la fiche : une
 * annulation en sort son auteur sans rien recalculer.
 */
export async function getFicheCredits(
  type: "place" | "item",
  slug: string,
): Promise<FicheCredits> {
  const groups = await contributions()
    .aggregate<{ _id: ObjectId; count: number; last: Date; name?: string }>([
      {
        $match: {
          "target.type": type,
          "target.slug": slug,
          status: "published",
        },
      },
      {
        $group: {
          _id: "$userId",
          count: { $sum: 1 },
          last: { $max: "$publishedAt" },
          name: { $last: "$userName" },
        },
      },
      { $sort: { count: -1, last: -1 } },
    ])
    .toArray();
  if (groups.length === 0) return { contributors: [], others: 0 };

  const shown = groups.slice(0, CREDITS_SHOWN);
  const accounts = await users()
    .find(
      { _id: { $in: shown.map((group) => group._id) } },
      { projection: LEVEL_PROJECTION },
    )
    .toArray();
  const byId = new Map(accounts.map((user) => [String(user._id), user]));
  const last = groups.reduce<Date | undefined>(
    (latest, group) =>
      group.last && (!latest || group.last > latest) ? group.last : latest,
    undefined,
  );

  return {
    contributors: shown.map((group) => {
      const user = byId.get(String(group._id));
      return {
        id: String(group._id),
        name: user?.name ?? group.name ?? "?",
        level: displayLevel(user),
        count: group.count,
      };
    }),
    others: groups.length - shown.length,
    updatedAt: last?.toISOString(),
  };
}

// ─── Classement ─────────────────────────────────────────────────────────────

/** Le premier jour du mois en cours, à minuit UTC. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Les points de chaque joueur depuis `since`, ceux qui en ont gagné. */
async function pointsSince(since: Date): Promise<Map<string, number>> {
  const rows = await pointEvents()
    .aggregate<{ _id: ObjectId; points: number }>([
      { $match: { at: { $gte: since } } },
      { $group: { _id: "$userId", points: { $sum: "$delta" } } },
      { $match: { points: { $gt: 0 } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [String(row._id), row.points]));
}

function rankEntries<T extends { points: number }>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  // Deux ex aequo partagent le même rang.
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || sorted[index - 1].points !== row.points) {
      rank = index + 1;
    }
    return { ...row, rank };
  });
}

/**
 * Le classement des joueurs ou des organisations, du mois ou depuis toujours.
 * Un joueur retiré du classement n'y figure pas, mais ses points comptent dans
 * ceux de ses organisations : une somme ne dit rien de lui.
 */
export async function getLeaderboard(
  period: LeaderboardPeriod,
  scope: LeaderboardScope,
  readerId?: ObjectId,
): Promise<Leaderboard> {
  const since = period === "month" ? monthStart() : undefined;
  const monthly = since ? await pointsSince(since) : null;

  if (scope === "orgs") {
    return {
      period,
      scope,
      since: since?.toISOString(),
      entries: await orgLeaderboard(monthly),
    };
  }

  let rows: { id: string; name: string; points: number; level: number }[];
  if (monthly) {
    const accounts = await users()
      .find(
        {
          _id: { $in: [...monthly.keys()].map((id) => new ObjectId(id)) },
          "contrib.hideFromLeaderboard": { $ne: true },
        },
        { projection: LEVEL_PROJECTION },
      )
      .toArray();
    rows = accounts.map((user) => ({
      id: String(user._id),
      name: user.name ?? "?",
      points: monthly.get(String(user._id)) ?? 0,
      level: displayLevel(user),
    }));
  } else {
    // Depuis toujours : assez de lignes pour situer le lecteur, au-delà des
    // premiers, sans lire tous les comptes.
    const accounts = await users()
      .find(
        {
          "contrib.points": { $gt: 0 },
          "contrib.hideFromLeaderboard": { $ne: true },
        },
        { projection: LEVEL_PROJECTION },
      )
      .sort({ "contrib.points": -1 })
      .limit(LEADERBOARD_SIZE)
      .toArray();
    rows = accounts.map((user) => ({
      id: String(user._id),
      name: user.name ?? "?",
      points: user.contrib?.points ?? 0,
      level: displayLevel(user),
    }));
  }

  const ranked = rankEntries(rows);
  const entries: LeaderboardEntry[] = ranked.slice(0, LEADERBOARD_SIZE);

  let me: Leaderboard["me"];
  if (readerId) {
    const reader = await users().findOne(
      { _id: readerId },
      { projection: { "contrib.points": 1, "contrib.hideFromLeaderboard": 1 } },
    );
    const hidden = reader?.contrib?.hideFromLeaderboard === true;
    const points = monthly
      ? (monthly.get(String(readerId)) ?? 0)
      : (reader?.contrib?.points ?? 0);
    let rank: number | undefined;
    if (!hidden && points > 0) {
      rank = monthly
        ? ranked.find((row) => row.id === String(readerId))?.rank
        : (await users().countDocuments({
            "contrib.points": { $gt: points },
            "contrib.hideFromLeaderboard": { $ne: true },
          })) + 1;
    }
    me = { rank, points, hidden };
  }

  return { period, scope, since: since?.toISOString(), entries, me };
}

/** Les organisations publiques, par la somme des points de leurs membres. */
async function orgLeaderboard(
  monthly: Map<string, number> | null,
): Promise<LeaderboardEntry[]> {
  const orgs = await db
    .db()
    .collection<{
      _id: string;
      name: string;
      tag?: string;
      image?: string;
      members?: { userId: ObjectId }[];
    }>("organizations")
    .find(
      { public: true, reportHidden: { $ne: true } },
      { projection: { name: 1, tag: 1, image: 1, "members.userId": 1 } },
    )
    .toArray();

  let allTime: Map<string, number> | null = null;
  if (!monthly) {
    const memberIds = [
      ...new Set(
        orgs.flatMap((org) =>
          (org.members ?? []).map((member) => String(member.userId)),
        ),
      ),
    ];
    const accounts = await users()
      .find(
        {
          _id: { $in: memberIds.map((id) => new ObjectId(id)) },
          "contrib.points": { $gt: 0 },
        },
        { projection: { "contrib.points": 1 } },
      )
      .toArray();
    allTime = new Map(
      accounts.map((user) => [String(user._id), user.contrib?.points ?? 0]),
    );
  }
  const points = (monthly ?? allTime)!;

  const rows = orgs
    .map((org) => ({
      id: String(org._id),
      name: org.name,
      tag: org.tag,
      image: org.image,
      members: org.members?.length ?? 0,
      points: (org.members ?? []).reduce(
        (sum, member) => sum + (points.get(String(member.userId)) ?? 0),
        0,
      ),
    }))
    .filter((row) => row.points > 0);

  return rankEntries(rows).slice(0, LEADERBOARD_SIZE);
}

/** Se retirer du classement, ou y revenir. */
export async function setLeaderboardVisibility(
  userId: ObjectId,
  hidden: boolean,
): Promise<void> {
  await users().updateOne(
    { _id: userId },
    { $set: { "contrib.hideFromLeaderboard": hidden } },
  );
}

export async function isHiddenFromLeaderboard(
  userId: ObjectId,
): Promise<boolean> {
  const user = await users().findOne(
    { _id: userId },
    { projection: { "contrib.hideFromLeaderboard": 1 } },
  );
  return user?.contrib?.hideFromLeaderboard === true;
}

// ─── Succès et évènements ───────────────────────────────────────────────────

/** Les succès du joueur : débloqués et en cours. */
export async function getAchievements(
  userId: ObjectId,
): Promise<Achievement[]> {
  const user = await users().findOne(
    { _id: userId },
    { projection: { "contrib.achievements": 1 } },
  );
  return evaluateAchievements(userId, user?.contrib?.achievements);
}

/** Pas plus d'évènements par lecture : l'app n'en fait pas une rafale. */
const MAX_EVENTS = 10;
/** Une première lecture, sans `since`, ne remonte pas plus loin. */
const DEFAULT_EVENTS_WINDOW_MS = DAY_MS;

/**
 * Ce qui est arrivé au joueur depuis `since` : ses contributions publiées ou
 * renvoyées à corriger, ses succès, sa dernière montée de niveau. Les titres
 * sont mis en mots par l'appelant, qui connaît la langue.
 */
export async function listContribEvents(
  userId: ObjectId,
  since: Date | undefined,
  titles: {
    achievement: (achievement: Achievement) => string;
    level: (level: number) => string;
  },
): Promise<ContribEvent[]> {
  const from = since ?? new Date(Date.now() - DEFAULT_EVENTS_WINDOW_MS);
  const [docs, user] = await Promise.all([
    contributions()
      .find(
        {
          userId,
          $or: [
            { status: "published", publishedAt: { $gt: from } },
            { status: "changesRequested", "review.at": { $gt: from } },
          ],
        },
        {
          projection: {
            kind: 1,
            status: 1,
            target: 1,
            points: 1,
            publishedAt: 1,
            review: 1,
          },
        },
      )
      .sort({ updatedAt: -1 })
      .limit(MAX_EVENTS)
      .toArray(),
    users().findOne(
      { _id: userId },
      { projection: { "contrib.achievements": 1, "contrib.levelUp": 1 } },
    ),
  ]);

  const events: ContribEvent[] = docs.map((doc) =>
    doc.status === "published"
      ? {
          type: "published",
          at: doc.publishedAt!.toISOString(),
          kind: doc.kind,
          name: doc.target.name,
          points: doc.points,
        }
      : {
          type: "changesRequested",
          at: doc.review!.at.toISOString(),
          kind: doc.kind,
          name: doc.target.name,
          message: doc.review?.message,
        },
  );

  for (const entry of user?.contrib?.achievements ?? []) {
    if (entry.at <= from) continue;
    const [key, rest] = entry.id.split(":");
    const achievement: Achievement = {
      id: entry.id,
      key: key as Achievement["key"],
      tier: key === "pioneer" ? (rest as Achievement["tier"]) : undefined,
      name: entry.name,
      at: entry.at.toISOString(),
    };
    events.push({
      type: "achievement",
      at: achievement.at!,
      id: entry.id,
      title: titles.achievement(achievement),
    });
  }

  const levelUp = user?.contrib?.levelUp;
  if (levelUp && levelUp.at > from) {
    events.push({
      type: "level",
      at: levelUp.at.toISOString(),
      level: levelUp.level,
      title: titles.level(levelUp.level),
    });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_EVENTS);
}

// ─── Fiche contributeur (admin) ─────────────────────────────────────────────

export class ContributorError extends Error {
  constructor(
    readonly code: ContributorErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "ContributorError";
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * L'onglet Contributeurs : par points, ou ceux dont le pseudo contient
 * `query`. Un compte sans point mais suspendu ou réglé à la main y figure.
 */
export async function listContributors(
  query?: string,
  limit = 50,
): Promise<ContributorRow[]> {
  const search = query?.trim().slice(0, 60);
  const accounts = await users()
    .find(
      search
        ? { name: { $regex: escapeRegex(search), $options: "i" } }
        : {
            $or: [
              { "contrib.points": { $gt: 0 } },
              { "contrib.trustLevel": { $exists: true } },
              { "contrib.suspendedUntil": { $gt: new Date() } },
            ],
          },
      {
        projection: {
          ...LEVEL_PROJECTION,
          "contrib.suspendedUntil": 1,
        },
      },
    )
    .sort({ "contrib.points": -1 })
    .limit(limit)
    .toArray();
  if (accounts.length === 0) return [];

  const ids = accounts.map((user) => user._id);
  const [published, against, standings] = await Promise.all([
    contributions()
      .aggregate<{ _id: ObjectId; count: number }>([
        { $match: { userId: { $in: ids }, status: "published" } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ])
      .toArray(),
    reports()
      .aggregate<{ _id: ObjectId; count: number }>([
        {
          $match: {
            status: "resolved",
            "resolution.authorIds": { $in: ids },
          },
        },
        { $unwind: "$resolution.authorIds" },
        { $match: { "resolution.authorIds": { $in: ids } } },
        { $group: { _id: "$resolution.authorIds", count: { $sum: 1 } } },
      ])
      .toArray(),
    Promise.all(ids.map((id) => getStanding(id))),
  ]);
  const publishedBy = new Map(
    published.map((row) => [String(row._id), row.count]),
  );
  const againstBy = new Map(against.map((row) => [String(row._id), row.count]));

  return accounts.map((user, index) => {
    const standing = standings[index];
    const id = String(user._id);
    return {
      id,
      name: user.name ?? id,
      points: user.contrib?.points ?? 0,
      level: standing.level,
      trustLevel: user.contrib?.trustLevel,
      published: publishedBy.get(id) ?? 0,
      acceptanceRate: standing.acceptanceRate,
      reportsAgainst: againstBy.get(id) ?? 0,
      suspendedUntil: standing.suspendedUntil,
    };
  });
}

/** Une ligne du registre des points d'un contributeur. */
export type PointLine = {
  at: string;
  delta: number;
  reason: string;
  note?: string;
};

/** Le détail d'un contributeur : sa ligne, ses avertissements, ses points. */
export async function getContributor(id: string): Promise<{
  row: ContributorRow;
  warnings: { at: string; note?: string }[];
  points: PointLine[];
} | null> {
  if (!ObjectId.isValid(id)) return null;
  const userId = new ObjectId(id);
  const user = await users().findOne(
    { _id: userId },
    { projection: { name: 1, isAdmin: 1, permissions: 1, contrib: 1 } },
  );
  if (!user) return null;

  const [standing, published, against, lines] = await Promise.all([
    getStanding(userId),
    contributions().countDocuments({ userId, status: "published" }),
    reports().countDocuments({
      status: "resolved",
      "resolution.authorIds": userId,
    }),
    pointEvents().find({ userId }).sort({ at: -1 }).limit(30).toArray(),
  ]);

  return {
    row: {
      id,
      name: user.name ?? id,
      points: user.contrib?.points ?? 0,
      level: standing.level,
      trustLevel: user.contrib?.trustLevel,
      published,
      acceptanceRate: standing.acceptanceRate,
      reportsAgainst: against,
      suspendedUntil: standing.suspendedUntil,
    },
    warnings: (user.contrib?.warnings ?? [])
      .map((warning) => ({ at: warning.at.toISOString(), note: warning.note }))
      .reverse(),
    points: lines.map((line) => ({
      at: line.at.toISOString(),
      delta: line.delta,
      reason: line.reason,
      note: line.note,
    })),
  };
}

/** Ce qu'un admin ou un modérateur peut faire sur la fiche d'un contributeur. */
export type ContributorInput =
  | { action: "trust"; level: number | null }
  | { action: "adjust"; points: number; reason: string }
  | { action: "warn"; note?: string }
  | { action: "suspend"; days: number; note?: string }
  | { action: "lift" };

/** Les actions réservées aux admins : elles touchent aux droits et aux points. */
export const ADMIN_ONLY_ACTIONS: ContributorInput["action"][] = [
  "trust",
  "adjust",
];

export function parseContributorInput(body: unknown): ContributorInput {
  const value = (body ?? {}) as Record<string, unknown>;
  switch (value.action) {
    case "trust": {
      if (value.level === null) return { action: "trust", level: null };
      const level = Number(value.level);
      if (
        !Number.isInteger(level) ||
        !LEVELS.some((entry) => entry.level === level)
      ) {
        throw new ContributorError("invalidLevel", 400);
      }
      return { action: "trust", level };
    }
    case "adjust": {
      const points = Number(value.points);
      if (
        !Number.isInteger(points) ||
        points === 0 ||
        Math.abs(points) > MAX_ADJUST_POINTS
      ) {
        throw new ContributorError("invalidPoints", 400);
      }
      const reason = cleanText(value.reason, MAX_ADJUST_REASON_LENGTH);
      if (!reason) throw new ContributorError("reasonRequired", 400);
      return { action: "adjust", points, reason };
    }
    case "warn":
      return {
        action: "warn",
        note: cleanText(value.note, MAX_ADJUST_REASON_LENGTH),
      };
    case "suspend": {
      const days = Number(value.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_SUSPENSION_DAYS) {
        throw new ContributorError("invalidDays", 400);
      }
      return {
        action: "suspend",
        days,
        note: cleanText(value.note, MAX_ADJUST_REASON_LENGTH),
      };
    }
    case "lift":
      return { action: "lift" };
    default:
      throw new ContributorError("notAllowed", 400);
  }
}

/**
 * Applique une décision sur un contributeur, et l'écrit au journal. Personne
 * ne règle son propre compte ; fixer un niveau ou des points est réservé aux
 * admins.
 */
export async function updateContributor(
  id: string,
  actor: Contributor,
  isAdminActor: boolean,
  input: ContributorInput,
): Promise<void> {
  if (!ObjectId.isValid(id)) throw new ContributorError("notFound", 404);
  const userId = new ObjectId(id);
  if (userId.equals(actor.id)) throw new ContributorError("self", 403);
  if (ADMIN_ONLY_ACTIONS.includes(input.action) && !isAdminActor) {
    throw new ContributorError("notAllowed", 403);
  }
  const exists = await users().countDocuments({ _id: userId });
  if (!exists) throw new ContributorError("notFound", 404);

  const now = new Date();
  let note: string | undefined;
  switch (input.action) {
    case "trust":
      await users().updateOne(
        { _id: userId },
        input.level === null
          ? { $unset: { "contrib.trustLevel": "" } }
          : { $set: { "contrib.trustLevel": input.level } },
      );
      note = input.level === null ? "auto" : `N${input.level}`;
      break;
    case "adjust":
      await pointEvents().insertOne({
        userId,
        delta: input.points,
        reason: "adjust",
        note: input.reason,
        by: actor.id,
        at: now,
      });
      await users().updateOne(
        { _id: userId },
        { $inc: { "contrib.points": input.points } },
      );
      note = `${input.points > 0 ? "+" : ""}${input.points} · ${input.reason}`;
      break;
    case "warn":
      await users().updateOne(
        { _id: userId },
        {
          $push: {
            "contrib.warnings": { at: now, by: actor.id, note: input.note },
          },
        },
      );
      note = input.note;
      break;
    case "suspend":
      await users().updateOne(
        { _id: userId },
        {
          $push: {
            "contrib.warnings": { at: now, by: actor.id, note: input.note },
          },
          $set: {
            "contrib.suspendedUntil": new Date(
              now.getTime() + input.days * DAY_MS,
            ),
          },
        },
      );
      note = [`${input.days} j`, input.note].filter(Boolean).join(" · ");
      break;
    case "lift":
      await users().updateOne(
        { _id: userId },
        { $unset: { "contrib.suspendedUntil": "" } },
      );
      break;
  }

  await logModeration({
    by: actor.id,
    byName: actor.name,
    action: `user.${input.action}`,
    userId,
    note,
  });
  await refreshProgress(userId);
}

/** Combien de contributions le joueur a dans chaque état, pour son profil. */
export async function countMyContributions(
  userId: ObjectId,
): Promise<
  Record<"published" | "pending" | "changesRequested" | "rejected", number>
> {
  const rows = await contributions()
    .aggregate<{ _id: string; count: number }>([
      { $match: { userId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  const by = new Map(rows.map((row) => [row._id, row.count]));
  return {
    published: by.get("published") ?? 0,
    pending: (by.get("pending") ?? 0) + (by.get("publishing") ?? 0),
    changesRequested: by.get("changesRequested") ?? 0,
    rejected: by.get("rejected") ?? 0,
  };
}
