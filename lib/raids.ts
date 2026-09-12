import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { CODE_ATTEMPTS, duplicateOf, newCode, normalizeCode } from "@/lib/join-codes";
import { RAID_NAME_MAX_LENGTH, type Raid, type ReadyCheck } from "@/types/squad";

/**
 * Raids, stored one document per raid — and nothing else.
 *
 * A raid holds no roster: its squads are whichever squad documents point at it
 * through `raidId`, which is why this module never reads the squads collection.
 * Everything that spans the two — linking, unlinking, succession of the lead
 * squad — lives in `lib/squads.ts`, which imports this one. The dependency goes
 * one way on purpose: a raid knows its own name, code and announcement, and
 * that is all.
 */

export interface DbRaid {
  _id: ObjectId;
  name: string;
  code: string;
  announcement: string;
  leadSquadId: string;
  /** Absent on every raid created before ready checks existed. */
  readyCheck?: ReadyCheck | null;
  createdAt: string;
  updatedAt: string;
}

/** The unique index on `code` this relies on is created by `scripts/ensure-indexes.ts`. */
function collection() {
  return db.db().collection<DbRaid>("raids");
}

function toRaid(doc: DbRaid): Raid {
  return {
    id: doc._id.toString(),
    name: doc.name,
    code: doc.code,
    announcement: doc.announcement,
    leadSquadId: doc.leadSquadId,
    readyCheck: doc.readyCheck ?? null,
    updatedAt: doc.updatedAt,
  };
}

export async function getRaid(raidId: string): Promise<Raid | null> {
  if (!ObjectId.isValid(raidId)) return null;

  const doc = await collection().findOne({ _id: new ObjectId(raidId) });
  return doc ? toRaid(doc) : null;
}

export async function getRaidByCode(code: string): Promise<Raid | null> {
  const doc = await collection().findOne({ code: normalizeCode(code) });
  return doc ? toRaid(doc) : null;
}

/**
 * Starts a raid, `leadSquadId` running it.
 *
 * Nothing is written to that squad here — the caller links it in, which is what
 * makes the raid non-empty. A raid whose lead squad never linked is invisible to
 * every query but its own code, and is cleaned up by `deleteRaid` the moment the
 * caller's link fails.
 */
export async function createRaid(
  name: string,
  leadSquadId: string,
): Promise<Raid> {
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const doc: DbRaid = {
      _id: new ObjectId(),
      name: name.slice(0, RAID_NAME_MAX_LENGTH),
      code: newCode(),
      announcement: "",
      leadSquadId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await collection().insertOne(doc);
      return toRaid(doc);
    } catch (error) {
      // The only unique index here is the code, so a duplicate is always one to
      // retry with another draw.
      if (duplicateOf(error) === null) throw error;
    }
  }

  throw new Error("could not allocate a free raid code");
}

/** Rewrites the name, the announcement, or both. An absent field is left alone. */
export async function updateRaid(
  raidId: string,
  patch: { name?: string; announcement?: string },
): Promise<Raid | null> {
  if (!ObjectId.isValid(raidId)) return null;

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.announcement !== undefined) set.announcement = patch.announcement;

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(raidId) },
    { $set: set },
    { returnDocument: "after" },
  );

  return updated ? toRaid(updated) : null;
}

/**
 * Stamps the raid with a ready check. Resetting the members is the squads'
 * business (`lib/squads.ts`, which calls this): a raid has no roster.
 */
export async function setRaidReadyCheck(
  raidId: string,
  readyCheck: ReadyCheck,
): Promise<Raid | null> {
  if (!ObjectId.isValid(raidId)) return null;

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(raidId) },
    { $set: { readyCheck, updatedAt: readyCheck.requestedAt } },
    { returnDocument: "after" },
  );

  return updated ? toRaid(updated) : null;
}

/**
 * Hands the raid to another squad — the succession `lib/squads.ts` arranges
 * when the lead squad unlinks or disbands.
 *
 * Guarded on the outgoing lead still being the one that was read, so two squads
 * leaving at once cannot both appoint a successor and have the last write win.
 */
export async function setRaidLeadSquad(
  raidId: string,
  fromSquadId: string,
  toSquadId: string,
): Promise<Raid | null> {
  if (!ObjectId.isValid(raidId)) return null;

  const updated = await collection().findOneAndUpdate(
    { _id: new ObjectId(raidId), leadSquadId: fromSquadId },
    {
      $set: { leadSquadId: toSquadId, updatedAt: new Date().toISOString() },
    },
    { returnDocument: "after" },
  );

  return updated ? toRaid(updated) : null;
}

export async function deleteRaid(raidId: string): Promise<void> {
  if (!ObjectId.isValid(raidId)) return;

  await collection().deleteOne({ _id: new ObjectId(raidId) });
}
