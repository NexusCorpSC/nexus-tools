import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import {
  CODE_ATTEMPTS,
  duplicateOf,
  newCode,
  normalizeCode,
} from "@/lib/join-codes";
import { deleteRaid, getRaid, setRaidLeadSquad } from "@/lib/raids";
import {
  BASE_SQUAD_ROLES,
  RAID_MAX_SQUADS,
  SQUAD_MAX_MEMBERS,
  type RaidView,
  type Squad,
  type SquadMember,
  type SquadMemberPatch,
  type SquadMembership,
  type SquadRole,
} from "@/types/squad";

/**
 * Squads, stored one document per squad with its members embedded.
 *
 * Embedded rather than a second collection because the overlay reads the whole
 * squad at once, several times a minute: one indexed `findOne` answers it. The
 * price is that every write has to be a positional update — two members
 * toggling «ready» at the same moment must not overwrite each other, which a
 * read-modify-write of the array would do.
 */

/**
 * A member as the collection actually holds one, which is not quite what the API
 * hands out: `lieutenant` is missing from every squad created before the rank
 * existed. Typing it as present would let TypeScript vouch for a field nothing
 * guarantees — `toSquad` is where it becomes true.
 */
type StoredMember = Omit<SquadMember, "lieutenant" | "role"> & {
  lieutenant?: boolean;
  role?: string;
};

export interface DbSquad {
  _id: ObjectId;
  name: string;
  code: string;
  leaderId: string;
  announcements: string;
  members: StoredMember[];
  /** Absent on every squad created before roles existed — see `toSquad`. */
  roles?: SquadRole[];
  /** Absent or `null` both mean the same: this squad runs alone. */
  raidId?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * What an aggregation stage should read instead of `$roles`.
 *
 * `$literal` because the seven are plain data: without it Mongo resolves any
 * string starting with a `$` as a field path, and a role labelled with one
 * would be the kind of bug nobody finds twice.
 */
const STORED_ROLES = {
  $ifNull: ["$roles", { $literal: BASE_SQUAD_ROLES }],
};

/**
 * The indexes this relies on — `code` unique, `members.userId` for every read
 * of every member — are created by `scripts/ensure-indexes.ts`, which also
 * carries the migration of the member index from unique to plain.
 */
function collection() {
  return db.db().collection<DbSquad>("squads");
}

function toSquad(doc: DbSquad): Squad {
  return {
    id: doc._id.toString(),
    name: doc.name,
    code: doc.code,
    leaderId: doc.leaderId,
    announcements: doc.announcements,
    // The one place the stored shape becomes the promised one, so no caller —
    // route, client or overlay — has to know that «absent» meant «no», nor that
    // a squad older than the feature carries no roles of its own.
    members: doc.members.map((member) => ({
      ...member,
      lieutenant: member.lieutenant ?? false,
      role: member.role ?? "",
    })),
    roles: doc.roles ?? BASE_SQUAD_ROLES.map((role) => ({ ...role })),
    raidId: doc.raidId ?? null,
    version: doc.version,
    updatedAt: doc.updatedAt,
  };
}

function newMember(
  userId: string,
  name: string,
  joinedAt: string,
): SquadMember {
  return {
    userId,
    name,
    joinedAt,
    ready: false,
    alive: true,
    position: "",
    role: "",
    lieutenant: false,
  };
}

/**
 * Whether this user gives the orders — the leader, or a lieutenant they
 * appointed.
 *
 * The one predicate the whole permission model rests on. Lieutenants hold the
 * leader's powers entire, appointing further lieutenants among them, so there is
 * nothing to tell apart past this point: every route asks this question and no
 * other.
 */
export function commandsSquad(squad: Squad, userId: string): boolean {
  if (squad.leaderId === userId) return true;

  return squad.members.some(
    (member) => member.userId === userId && member.lieutenant,
  );
}

/** When this user joined a squad — the order their memberships are listed in. */
function joinedAtOf(doc: DbSquad, userId: string): string {
  return doc.members.find((member) => member.userId === userId)?.joinedAt ?? "";
}

/**
 * Every squad the caller is in, longest-standing membership first.
 *
 * One member for almost everyone, so the sort is nearly always a no-op; a
 * raid's organiser who opened the raid's squads is the reason it exists at all.
 */
export async function getSquadsForUser(userId: string): Promise<Squad[]> {
  const docs = await collection().find({ "members.userId": userId }).toArray();

  return docs
    .sort((a, b) =>
      joinedAtOf(a, userId).localeCompare(joinedAtOf(b, userId)),
    )
    .map(toSquad);
}

/** What a switcher needs to know about each of them, and nothing more. */
export function membershipsOf(squads: Squad[]): SquadMembership[] {
  return squads.map((squad) => ({
    id: squad.id,
    name: squad.name,
    code: squad.code,
    raidId: squad.raidId,
  }));
}

/**
 * The squad a request means: the one it named, if the caller is in it, and
 * otherwise the longest-standing of their memberships.
 *
 * The fallback is for reading. The id most likely to go stale is the one a
 * client remembered across a poll — of a squad it has just left, or been put
 * out of — and answering with the squad they are still in is what lets that
 * client recover without a special case. A *write* naming a squad the caller
 * is not in is refused by the route instead: acting on some other squad than
 * the one asked for is not a recovery.
 */
export function pickSquad(squads: Squad[], squadId?: string | null): Squad | null {
  if (squadId) {
    const named = squads.find((squad) => squad.id === squadId);
    if (named) return named;
  }

  return squads[0] ?? null;
}

export async function getSquadForUser(
  userId: string,
  squadId?: string | null,
): Promise<Squad | null> {
  return pickSquad(await getSquadsForUser(userId), squadId);
}

/**
 * Writes a fresh squad document, drawing codes until one is free.
 *
 * The one place a squad is born, whether on its own or inside a raid: the two
 * differ by a pointer, and everything else about a new squad — one member who
 * leads it, the seven base roles — is the same.
 */
async function insertSquad(
  userId: string,
  name: string,
  memberName: string,
  raidId: string | null,
): Promise<Squad> {
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const doc: DbSquad = {
      _id: new ObjectId(),
      name,
      code: newCode(),
      leaderId: userId,
      announcements: "",
      members: [newMember(userId, memberName, now)],
      roles: BASE_SQUAD_ROLES.map((role) => ({ ...role })),
      raidId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await collection().insertOne(doc);
      return toSquad(doc);
    } catch (error) {
      // Only the code can collide now that the member index is not unique;
      // anything else is a real failure.
      if (duplicateOf(error) !== "code") throw error;
    }
  }

  throw new Error("could not allocate a free squad code");
}

/**
 * Starts a squad with its creator as leader and only member.
 *
 * Starting fresh means leaving whatever they were in first — every squad,
 * including the ones they were leading, which are handed over on the way out.
 * Opening a squad *without* leaving is `createSquadInRaid`, which is the only
 * way a user ends up in more than one.
 */
export async function createSquad(
  userId: string,
  name: string,
  memberName: string,
): Promise<Squad> {
  await leaveAllSquads(userId);

  return insertSquad(userId, name, memberName, null);
}

export type CreateInRaidOutcome = { squad: Squad } | { refusal: "full" };

/**
 * Opens another squad of a raid, the caller leading it — and staying in the
 * squad they came from.
 *
 * This is how a raid gets its Bravo and its Charlie before anyone is in them:
 * the organiser opens each, hands its code out, and passes the lead on once
 * the right person has joined. An empty squad cannot exist (the last member
 * out deletes it), so the creator has to be its first member, which is what
 * makes multiple memberships a thing at all.
 *
 * The cap is checked the same way `linkSquadToRaid` checks it: read, then
 * written without a guard. Two organisers opening squads in the same instant
 * can overshoot by one, which costs a scroll.
 */
export async function createSquadInRaid(
  userId: string,
  name: string,
  memberName: string,
  raidId: string,
): Promise<CreateInRaidOutcome> {
  const current = await getSquadsOfRaid(raidId);
  if (current.length >= RAID_MAX_SQUADS) return { refusal: "full" };

  return { squad: await insertSquad(userId, name, memberName, raidId) };
}

export type JoinOutcome =
  | { squad: Squad }
  | { refusal: "not-found" }
  | { refusal: "full" };

/** Adds the caller to the squad holding `code`, leaving whatever they were in. */
export async function joinSquad(
  userId: string,
  memberName: string,
  code: string,
): Promise<JoinOutcome> {
  const squad = await collection().findOne({ code: normalizeCode(code) });
  if (!squad) return { refusal: "not-found" };

  // Already in it: answer with the squad rather than an error. Joining twice is
  // something a client can do by retrying, and it changed nothing.
  if (squad.members.some((member) => member.userId === userId)) {
    return { squad: toSquad(squad) };
  }

  if (squad.members.length >= SQUAD_MAX_MEMBERS) return { refusal: "full" };

  await leaveAllSquads(userId);

  const now = new Date().toISOString();

  const updated = await collection().findOneAndUpdate(
    {
      _id: squad._id,
      /*
       * Everything the three reads above established, re-established inside
       * the write, because each of them is a moment old:
       *
       * - not a member yet. Nothing but this guard stops two requests for the
       *   same user from pushing two rows into the same squad;
       * - not full. Two people can accept the same invitation at once;
       * - not empty. A squad with no members is one the last leaver is in the
       *   middle of removing; joining it would produce a squad whose leader is
       *   somebody who is gone, which nothing can put right.
       */
      "members.userId": { $ne: userId },
      $expr: {
        $and: [
          { $lt: [{ $size: "$members" }, SQUAD_MAX_MEMBERS] },
          { $gt: [{ $size: "$members" }, 0] },
        ],
      },
    },
    {
      $push: { members: newMember(userId, memberName, now) },
      $set: { updatedAt: now },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  if (updated) return { squad: toSquad(updated) };

  /*
   * One of the three guards refused, and only the document says which. Worth the
   * read on a path this rare: the alternatives are all lies — «full» said of a
   * squad that is gone, or of one the caller is now a member of because their
   * other client got there first.
   */
  const current = await collection().findOne({ _id: squad._id });

  if (!current || current.members.length === 0) return { refusal: "not-found" };

  if (current.members.some((member) => member.userId === userId)) {
    return { squad: toSquad(current) };
  }

  return { refusal: "full" };
}

/**
 * Takes the caller out of every squad they are in — what starting or joining
 * a squad afresh means.
 *
 * One at a time rather than one query: each departure arranges its own
 * succession, and the raid each squad is in has its own to arrange.
 */
export async function leaveAllSquads(userId: string): Promise<void> {
  const docs = await collection()
    .find({ "members.userId": userId })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();

  for (const doc of docs) {
    await leaveSquad(userId, doc._id.toString());
  }
}

/**
 * Takes the caller out of one squad.
 *
 * The squad outlives its founder: when the leader is the one leaving, the role
 * passes to the longest-standing member left — a leader whose game crashed
 * should not take the squad down with them. The document is only deleted when
 * the last member walks out.
 *
 * Idempotent: a squad the caller is not in, or that does not exist, is left
 * alone.
 */
export async function leaveSquad(userId: string, squadId: string): Promise<void> {
  if (!ObjectId.isValid(squadId)) return;

  const squad = await collection().findOne({
    _id: new ObjectId(squadId),
    "members.userId": userId,
  });
  if (!squad) return;

  if (squad.members.length === 1) {
    // Guarded on the size at write time, not on the size that was read: someone
    // may have joined since, and deleting the document would take their squad
    // with it. If the guard refuses, the pipeline below handles it as an
    // ordinary departure.
    const removed = await collection().deleteOne({
      _id: squad._id,
      $expr: { $eq: [{ $size: "$members" }, 1] },
    });

    if (removed.deletedCount > 0) {
      await releaseRaid(squad.raidId ?? null, squad._id.toString());
      return;
    }
  }

  /*
   * The pull and the succession in one write, with the successor picked by the
   * server from what is left *after* the pull.
   *
   * Choosing it here from the document read above would race every other
   * departure: the member picked could have walked out in between, and the squad
   * would end up naming a leader who is not one of its members — a state nothing
   * in this module can recover from, since leadership is only ever handed over by
   * someone leaving.
   */
  await collection().updateOne({ _id: squad._id }, [
    {
      $set: {
        members: {
          $filter: {
            input: "$members",
            cond: { $ne: ["$$this.userId", userId] },
          },
        },
      },
    },
    {
      $set: {
        leaderId: {
          $cond: [
            { $eq: ["$leaderId", userId] },
            {
              $let: {
                vars: {
                  // The longest-standing member left. `$reduce` rather than
                  // `$sortArray`, which wants a newer server than this asks for.
                  oldest: {
                    $reduce: {
                      input: "$members",
                      initialValue: null,
                      in: {
                        $cond: [
                          {
                            $or: [
                              { $eq: ["$$value", null] },
                              { $lt: ["$$this.joinedAt", "$$value.joinedAt"] },
                            ],
                          },
                          "$$this",
                          "$$value",
                        ],
                      },
                    },
                  },
                },
                in: "$$oldest.userId",
              },
            },
            "$leaderId",
          ],
        },
        updatedAt: new Date().toISOString(),
        version: { $add: ["$version", 1] },
      },
    },
    {
      /*
       * The rank never applies to whoever leads, and succession is the one place
       * it could: the longest-standing member left may well be a lieutenant.
       *
       * A third stage rather than part of the one above, because it has to read
       * the `leaderId` that stage just wrote — a pipeline stage only ever sees
       * what came out of the previous one.
       */
      $set: {
        members: {
          $map: {
            input: "$members",
            in: {
              $mergeObjects: [
                "$$this",
                {
                  $cond: [
                    { $eq: ["$$this.userId", "$leaderId"] },
                    { lieutenant: false },
                    {},
                  ],
                },
              ],
            },
          },
        },
      },
    },
  ]);

  // Only reachable when everyone else left while this one was being written, so
  // the pipeline pulled the last member instead of the delete above. A squad
  // nobody is in is invisible to every query — and would keep its code forever.
  const emptied = await collection().deleteOne({
    _id: squad._id,
    "members.0": { $exists: false },
  });

  if (emptied.deletedCount > 0) {
    await releaseRaid(squad.raidId ?? null, squad._id.toString());
  }
}

/**
 * Rewrites one member's row. Positional, so it touches nothing else in the
 * array — which is what makes two members updating themselves at once safe.
 *
 * `name` refreshes the copy taken when they joined, and is only passed when the
 * member is writing to their own row.
 */
export async function updateSquadMember(
  squadId: string,
  targetUserId: string,
  patch: SquadMemberPatch,
  name?: string,
): Promise<Squad | null> {
  const set: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (patch.ready !== undefined) set["members.$.ready"] = patch.ready;

  if (patch.alive !== undefined) {
    set["members.$.alive"] = patch.alive;

    /*
     * Going down clears «prêt», whatever the row said a second ago.
     *
     * Not a convenience: the overlay counts «n/m prêts» over the whole squad,
     * and a member who was ready when they were shot would keep the squad
     * reading as ready while it is being wiped. Cleared here rather than asked
     * of the client so every client agrees — and so the two flags cannot
     * disagree between a death and whatever the client sends next.
     */
    if (patch.alive === false && patch.ready === undefined) {
      set["members.$.ready"] = false;
    }
  }

  if (patch.position !== undefined) set["members.$.position"] = patch.position;
  if (patch.role !== undefined) set["members.$.role"] = patch.role;
  if (patch.lieutenant !== undefined) {
    set["members.$.lieutenant"] = patch.lieutenant;
  }
  if (name !== undefined) set["members.$.name"] = name;

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(squadId), "members.userId": targetUserId },
    { $set: set, $inc: { version: 1 } },
    { returnDocument: "after" },
  );

  return updated ? toSquad(updated) : null;
}

/**
 * Hands the squad to another member.
 *
 * One write, and an aggregation pipeline for the same reason `leaveSquad` needs
 * one: the two rows involved change together. The outgoing leader is made a
 * lieutenant on the way out — they keep the powers they had a moment ago, and a
 * handover during a drop should not cost the person who organised it their say —
 * while the incoming one loses a rank that has become meaningless.
 *
 * Guarded on the target still being a member: they may have left between the
 * click and the write, and a squad whose `leaderId` names nobody is the one
 * state nothing here can repair.
 */
export async function transferLeadership(
  squadId: string,
  fromUserId: string,
  toUserId: string,
): Promise<Squad | null> {
  const updated = await collection().findOneAndUpdate(
    {
      _id: new ObjectId(squadId),
      "members.userId": toUserId,
      // Whoever is handing over must still be the leader: two commanders naming
      // two different successors at once would otherwise both «succeed», and the
      // last write would silently win.
      leaderId: fromUserId,
    },
    [
      {
        $set: {
          leaderId: toUserId,
          members: {
            $map: {
              input: "$members",
              in: {
                $mergeObjects: [
                  "$$this",
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ["$$this.userId", toUserId] },
                          then: { lieutenant: false },
                        },
                        {
                          case: { $eq: ["$$this.userId", fromUserId] },
                          then: { lieutenant: true },
                        },
                      ],
                      default: {},
                    },
                  },
                ],
              },
            },
          },
          updatedAt: new Date().toISOString(),
          version: { $add: ["$version", 1] },
        },
      },
    ],
    { returnDocument: "after" },
  );

  return updated ? toSquad(updated) : null;
}

/**
 * Takes a member out of a squad someone else runs.
 *
 * Distinct from `leaveSquad`, which is somebody removing *themselves*: there is
 * no succession to arrange here — the route refuses to remove the leader, so
 * whoever is in charge is still there afterwards — and no chance of emptying the
 * squad, since that leader is never the target.
 *
 * Answers `null` when the target is not in the squad, which is what a second
 * click on the same button sends.
 */
export async function removeSquadMember(
  squadId: string,
  targetUserId: string,
): Promise<Squad | null> {
  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(squadId), "members.userId": targetUserId },
    {
      $pull: { members: { userId: targetUserId } },
      $set: { updatedAt: new Date().toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  return updated ? toSquad(updated) : null;
}

export async function setSquadAnnouncements(
  squadId: string,
  announcements: string,
): Promise<Squad | null> {
  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(squadId) },
    {
      $set: { announcements, updatedAt: new Date().toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  return updated ? toSquad(updated) : null;
}

/** Renames the squad. Whoever commands it may, at any time. */
export async function setSquadName(
  squadId: string,
  name: string,
): Promise<Squad | null> {
  if (!ObjectId.isValid(squadId)) return null;

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(squadId) },
    {
      $set: { name, updatedAt: new Date().toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  return updated ? toSquad(updated) : null;
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

/**
 * An id nothing else in the squad can be wearing.
 *
 * Random rather than derived from the label, which is the shape of bug this
 * avoids: two roles named the same, or a role renamed into another's slug,
 * would share an id — and every read of `members.role` resolves to whichever
 * comes first.
 *
 * Drawn by `newCode`, so it is `randomBytes` rather than `Math.random`. Not
 * only for the collision odds, which a squad of twenty roles would never have
 * met: `Math.random().toString(36)` is as long as the draw happens to be, and
 * a value like `0.5` yields a *one-character* id. The prefix keeps it out of
 * the base roles' own slugs, which are lowercase words.
 */
function newRoleId(): string {
  return `r${newCode()}`;
}

/** Whether the squad's roles — stored or implied — hold this id. */
function hasRole(roleId: string) {
  return {
    $in: [roleId, { $map: { input: STORED_ROLES, in: "$$this.id" } }],
  };
}

/**
 * Adds a role to the squad's own list.
 *
 * The `$ifNull` is what lets a squad created before roles existed grow one
 * without a migration: the seven are written out alongside the new one the
 * first time anybody adds to them, which is exactly when they stop being
 * implicit.
 */
export async function createSquadRole(
  squadId: string,
  label: string,
  icon: SquadRole["icon"],
): Promise<Squad | null> {
  if (!ObjectId.isValid(squadId)) return null;

  const role: SquadRole = { id: newRoleId(), label, icon, base: false };

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(squadId) },
    [
      {
        $set: {
          roles: { $concatArrays: [STORED_ROLES, { $literal: [role] }] },
          updatedAt: new Date().toISOString(),
          version: { $add: ["$version", 1] },
        },
      },
    ],
    { returnDocument: "after" },
  );

  return updated ? toSquad(updated) : null;
}

/**
 * Renames a role, changes its glyph, or both — base roles included: «Médic» is
 * a suggestion, not a fact about the squad.
 *
 * Answers `null` when no role carries that id, which is what a second click on
 * a role somebody else just deleted sends.
 */
export async function updateSquadRole(
  squadId: string,
  roleId: string,
  patch: { label?: string; icon?: SquadRole["icon"] },
): Promise<Squad | null> {
  if (!ObjectId.isValid(squadId)) return null;

  const changed: Record<string, unknown> = {};
  if (patch.label !== undefined) changed.label = patch.label;
  if (patch.icon !== undefined) changed.icon = patch.icon;

  const updated = await collection().findOneAndUpdate(
    // Guarded on the role existing, because the pipeline below cannot refuse:
    // without this, asking about a role nobody has would still materialise the
    // seven, bump the version and move `updatedAt` — a write on the way to a
    // 404, and a poll waking every member of the squad for nothing.
    { _id: new ObjectId(squadId), $expr: hasRole(roleId) },
    [
      {
        $set: {
          roles: {
            $map: {
              input: STORED_ROLES,
              in: {
                $cond: [
                  { $eq: ["$$this.id", roleId] },
                  { $mergeObjects: ["$$this", { $literal: changed }] },
                  "$$this",
                ],
              },
            },
          },
          updatedAt: new Date().toISOString(),
          version: { $add: ["$version", 1] },
        },
      },
    ],
    { returnDocument: "after" },
  );

  return updated ? toSquad(updated) : null;
}

/**
 * Drops a role, and takes it off everyone wearing it in the same write.
 *
 * Both halves have to happen together: a member left pointing at a role that no
 * longer exists would show no icon and no name, with no way to tell it apart
 * from «no role» — which is what they are given instead, explicitly.
 *
 * Base roles are refused by the route; nothing here depends on that beyond the
 * `base` flag surviving the filter.
 */
export async function deleteSquadRole(
  squadId: string,
  roleId: string,
): Promise<Squad | null> {
  if (!ObjectId.isValid(squadId)) return null;

  const updated = await collection().findOneAndUpdate(
    // Same guard as `updateSquadRole`: two commanders deleting the same role at
    // once, and the second one writes nothing rather than writing nothing
    // loudly.
    { _id: new ObjectId(squadId), $expr: hasRole(roleId) },
    [
      {
        $set: {
          roles: {
            $filter: {
              input: STORED_ROLES,
              cond: { $ne: ["$$this.id", roleId] },
            },
          },
          members: {
            $map: {
              input: "$members",
              in: {
                $mergeObjects: [
                  "$$this",
                  {
                    $cond: [
                      { $eq: [{ $ifNull: ["$$this.role", ""] }, roleId] },
                      { role: "" },
                      {},
                    ],
                  },
                ],
              },
            },
          },
          updatedAt: new Date().toISOString(),
          version: { $add: ["$version", 1] },
        },
      },
    ],
    { returnDocument: "after" },
  );

  return updated ? toSquad(updated) : null;
}

/* ------------------------------------------------------------------ */
/* Raids                                                               */
/* ------------------------------------------------------------------ */

/**
 * The squads of a raid, longest-standing first — which is also the order the
 * lead is handed down in.
 */
export async function getSquadsOfRaid(raidId: string): Promise<Squad[]> {
  const docs = await collection()
    .find({ raidId })
    .sort({ createdAt: 1 })
    .toArray();

  return docs.map(toSquad);
}

/** A raid with its squads, or `null` when the id names none. */
export async function getRaidView(raidId: string): Promise<RaidView | null> {
  const raid = await getRaid(raidId);
  if (!raid) return null;

  const squads = await getSquadsOfRaid(raidId);

  // A raid nobody points at anymore is one the last unlink failed to clean up.
  // Answering `null` keeps it invisible; the next `releaseRaid` removes it.
  if (squads.length === 0) return null;

  return { ...raid, squads };
}

/**
 * Takes a squad out of the raid it was in, and leaves the raid standing if
 * anyone is left in it.
 *
 * The lead squad leaving hands the raid to the longest-standing one left, the
 * same bargain `leaveSquad` strikes inside a squad; the last one out deletes it.
 * Called from both the route and `leaveSquad`, which is why it takes ids rather
 * than the documents either of them happens to be holding.
 */
async function releaseRaid(
  raidId: string | null,
  squadId: string,
): Promise<void> {
  if (!raidId) return;

  const remaining = await collection()
    .find({ raidId })
    .sort({ createdAt: 1 })
    .toArray();

  if (remaining.length === 0) {
    await deleteRaid(raidId);
    return;
  }

  const raid = await getRaid(raidId);
  if (!raid || raid.leadSquadId !== squadId) return;

  await setRaidLeadSquad(raidId, squadId, remaining[0]._id.toString());
}

/** Clears the pointer, then lets the raid work out what that leaves it. */
export async function unlinkSquadFromRaid(squad: Squad): Promise<Squad | null> {
  if (!squad.raidId) return squad;
  if (!ObjectId.isValid(squad.id)) return null;

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(squad.id) },
    {
      $set: { raidId: null, updatedAt: new Date().toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  await releaseRaid(squad.raidId, squad.id);

  return updated ? toSquad(updated) : null;
}

export type LinkOutcome = { squad: Squad } | { refusal: "full" };

/**
 * Points a squad at a raid, leaving whatever raid it was in first — one at a
 * time, the same rule a player is held to for squads.
 *
 * The cap is checked and then written without a guard, because the count lives
 * in this collection while the cap belongs to the raid: two squads linking in
 * the same instant can both pass. Seven squads instead of six costs a scroll,
 * which is a great deal cheaper than the transaction that would prevent it.
 */
export async function linkSquadToRaid(
  squad: Squad,
  raidId: string,
): Promise<LinkOutcome> {
  if (squad.raidId === raidId) return { squad };

  const current = await getSquadsOfRaid(raidId);
  if (current.length >= RAID_MAX_SQUADS) return { refusal: "full" };

  if (squad.raidId) await unlinkSquadFromRaid(squad);

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(squad.id) },
    {
      $set: { raidId, updatedAt: new Date().toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  return { squad: updated ? toSquad(updated) : squad };
}
