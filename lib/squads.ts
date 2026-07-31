import "server-only";
import { ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import db from "@/lib/db";
import {
  SQUAD_MAX_MEMBERS,
  type Squad,
  type SquadMember,
  type SquadMemberPatch,
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
type StoredMember = Omit<SquadMember, "lieutenant"> & { lieutenant?: boolean };

export interface DbSquad {
  _id: ObjectId;
  name: string;
  code: string;
  leaderId: string;
  announcements: string;
  members: StoredMember[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

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
    // route, client or overlay — has to know that «absent» meant «no».
    members: doc.members.map((member) => ({
      ...member,
      lieutenant: member.lieutenant ?? false,
    })),
    version: doc.version,
    updatedAt: doc.updatedAt,
  };
}

let indexesPromise: Promise<unknown> | null = null;

/**
 * Runs once per process. A failure here is not fatal but it does lower the
 * guarantees: without the indexes, the writes below stop being refused and
 * start being merely unlikely to collide.
 */
export async function ensureSquadIndexes() {
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection().createIndex({ code: 1 }, { unique: true }),
      /*
       * Every poll of every member goes through this one — and it is unique,
       * which is not about speed: it is what makes «one squad at a time» a fact
       * rather than a convention the code hopes to keep. Two requests for the
       * same user racing each other would otherwise leave them a member of two
       * squads with no way back, since `leaveSquad` only ever finds one of them.
       *
       * Unique *and* multikey is fine: MongoDB de-duplicates index keys within
       * a document, so a squad may list a member once and no other squad may
       * list them at all.
       */
      collection().createIndex({ "members.userId": 1 }, { unique: true }),
    ]).catch((error) => {
      indexesPromise = null;
      console.warn({ error, message: "Could not create squads indexes" });
    });
  }

  return indexesPromise;
}

/*
 * The join code is spoken out loud as often as it is pasted, so the alphabet
 * drops everything that sounds or looks like something else: no I, no O, no 0,
 * no 1. 32 characters over 6 places is about a billion codes.
 *
 * 256 divides evenly by 32, so taking each random byte modulo the alphabet
 * length is unbiased.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_ATTEMPTS = 5;

function newCode(): string {
  return Array.from(
    randomBytes(CODE_LENGTH),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");
}

/** The form a code takes in the database, and what a typed one is compared as. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Which of the two unique indexes a write collided with, or `null` if it did not
 * collide at all.
 *
 * Both cases are duplicate keys and neither is a bug, but they call for opposite
 * answers: a taken code is retried with another one, whereas a user who is
 * already in a squad is not something a retry can fix.
 */
function duplicateOf(error: unknown): "code" | "member" | null {
  const failure = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
    message?: string;
  } | null;

  if (failure?.code !== 11000) return null;

  // `keyPattern` names the index; the message is the fallback for drivers or
  // proxies that do not carry it.
  const named = failure.keyPattern
    ? Object.keys(failure.keyPattern).join(" ")
    : (failure.message ?? "");

  return named.includes("members.userId") ? "member" : "code";
}

/** Answered when a user turns out to have joined something else in between. */
export type Elsewhere = { refusal: "elsewhere" };

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

export async function getSquadForUser(userId: string): Promise<Squad | null> {
  // Ensured on the read path too, not only on writes: unlike a uniqueness
  // constraint, `members.userId` exists for this very query, which every member
  // runs every couple of seconds.
  await ensureSquadIndexes();

  const doc = await collection().findOne({ "members.userId": userId });
  return doc ? toSquad(doc) : null;
}

/**
 * Starts a squad with its creator as leader and only member.
 *
 * A user belongs to one squad at a time, so whatever they were in is left
 * first — including the squad they were leading, which is handed over on the
 * way out.
 */
export async function createSquad(
  userId: string,
  name: string,
  memberName: string,
): Promise<{ squad: Squad } | Elsewhere> {
  await ensureSquadIndexes();
  await leaveSquad(userId);

  const now = new Date().toISOString();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const doc: DbSquad = {
      _id: new ObjectId(),
      name,
      code: newCode(),
      leaderId: userId,
      announcements: "",
      members: [newMember(userId, memberName, now)],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await collection().insertOne(doc);
      return { squad: toSquad(doc) };
    } catch (error) {
      const duplicate = duplicateOf(error);
      if (duplicate === null) throw error;

      // Not the code: another request put this user in a squad between the
      // `leaveSquad` above and this insert. A retry would collide again — they
      // are somewhere else now, and only they can decide to leave it.
      if (duplicate === "member") return { refusal: "elsewhere" };
    }
  }

  throw new Error("could not allocate a free squad code");
}

export type JoinOutcome =
  | { squad: Squad }
  | { refusal: "not-found" }
  | { refusal: "full" }
  | Elsewhere;

/** Adds the caller to the squad holding `code`, leaving whatever they were in. */
export async function joinSquad(
  userId: string,
  memberName: string,
  code: string,
): Promise<JoinOutcome> {
  await ensureSquadIndexes();

  const squad = await collection().findOne({ code: normalizeCode(code) });
  if (!squad) return { refusal: "not-found" };

  // Already in it: answer with the squad rather than an error. Joining twice is
  // something a client can do by retrying, and it changed nothing.
  if (squad.members.some((member) => member.userId === userId)) {
    return { squad: toSquad(squad) };
  }

  if (squad.members.length >= SQUAD_MAX_MEMBERS) return { refusal: "full" };

  await leaveSquad(userId);

  const now = new Date().toISOString();

  let updated;
  try {
    updated = await collection().findOneAndUpdate(
      {
        _id: squad._id,
        /*
         * Everything the three reads above established, re-established inside
         * the write, because each of them is a moment old:
         *
         * - not a member yet. The unique index does not help here: MongoDB
         *   de-duplicates keys within a document, so nothing but this guard
         *   stops two requests for the same user from pushing two rows into the
         *   same squad;
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
  } catch (error) {
    if (duplicateOf(error) !== "member") throw error;

    // The unique index caught a second request for this user landing between
    // the leave above and this push. Refused rather than papered over: they are
    // in a squad, just not this one.
    return { refusal: "elsewhere" };
  }

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
 * Takes the caller out of their squad.
 *
 * The squad outlives its founder: when the leader is the one leaving, the role
 * passes to the longest-standing member left — a leader whose game crashed
 * should not take the squad down with them. The document is only deleted when
 * the last member walks out.
 */
export async function leaveSquad(userId: string): Promise<void> {
  const squad = await collection().findOne({ "members.userId": userId });
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

    if (removed.deletedCount > 0) return;
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
  await collection().deleteOne({
    _id: squad._id,
    "members.0": { $exists: false },
  });
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
  if (patch.alive !== undefined) set["members.$.alive"] = patch.alive;
  if (patch.position !== undefined) set["members.$.position"] = patch.position;
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
