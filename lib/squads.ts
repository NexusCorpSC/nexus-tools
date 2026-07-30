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

export interface DbSquad {
  _id: ObjectId;
  name: string;
  code: string;
  leaderId: string;
  announcements: string;
  members: SquadMember[];
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
    members: doc.members,
    version: doc.version,
    updatedAt: doc.updatedAt,
  };
}

let indexesPromise: Promise<unknown> | null = null;

/**
 * Runs once per process. Failures are not fatal: the code is checked for
 * uniqueness by the insert retry below, and the member lookup works without an
 * index — it is only slower.
 */
export async function ensureSquadIndexes() {
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      collection().createIndex({ code: 1 }, { unique: true }),
      // Every poll of every member goes through this one.
      collection().createIndex({ "members.userId": 1 }),
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

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

function newMember(
  userId: string,
  name: string,
  joinedAt: string,
): SquadMember {
  return { userId, name, joinedAt, ready: false, alive: true, position: "" };
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
): Promise<Squad> {
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
      return toSquad(doc);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }

  throw new Error("could not allocate a free squad code");
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

  const updated = await collection().findOneAndUpdate(
    {
      _id: squad._id,
      // Re-checked inside the write: the count above was read a moment ago, and
      // two people can accept the same invitation at the same time.
      $expr: { $lt: [{ $size: "$members" }, SQUAD_MAX_MEMBERS] },
    },
    {
      $push: { members: newMember(userId, memberName, now) },
      $set: { updatedAt: now },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );

  if (updated) return { squad: toSquad(updated) };

  // The guard above is the only thing that can have refused the write — unless
  // the squad went away entirely between the two reads, which is what the last
  // member leaving does. Telling those apart costs one read on a path that is
  // already rare, and «full» would otherwise be said of a squad that is gone.
  const stillThere = await collection().countDocuments(
    { _id: squad._id },
    { limit: 1 },
  );

  return { refusal: stillThere > 0 ? "full" : "not-found" };
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

  const remaining = squad.members.filter((member) => member.userId !== userId);

  if (remaining.length === 0) {
    await collection().deleteOne({ _id: squad._id });
    return;
  }

  const successor = remaining.reduce((oldest, member) =>
    member.joinedAt < oldest.joinedAt ? member : oldest,
  );

  await collection().updateOne(
    { _id: squad._id },
    {
      // The pull and the succession in one write: a squad must never be seen
      // without the member it still calls its leader.
      $pull: { members: { userId } },
      $set: {
        leaderId: squad.leaderId === userId ? successor.userId : squad.leaderId,
        updatedAt: new Date().toISOString(),
      },
      $inc: { version: 1 },
    },
  );
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
  if (name !== undefined) set["members.$.name"] = name;

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(squadId), "members.userId": targetUserId },
    { $set: set, $inc: { version: 1 } },
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
