import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import db from "./db";
import { addInventoryRows } from "./inventory-quick-add";
import { roundQty } from "./utils";
import {
  sortJobs,
  type RefiningCollectInput,
  type RefiningJob,
  type RefiningJobInput,
  type RefiningLine,
} from "./refining";

export type { RefiningJob } from "./refining";

/**
 * Un ordre en base. Les ordres saisis avant les lignes n'ont que `location`
 * (texte libre) et `content` ; ils restent lisibles tels quels et prennent
 * des lignes à leur première modification.
 */
export interface DbRefiningJob {
  id: string;
  userId: ObjectId;
  location: string;
  locationId?: string;
  method?: string;
  lines?: RefiningLine[];
  content?: string;
  cost?: number;
  note?: string;
  duration: number;
  startTime: string;
  /** Toujours "active" : un ordre collecté est supprimé. */
  status: "active";
}

export class RefiningError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_location" | "invalid",
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

function jobs() {
  return db.db().collection<DbRefiningJob>("refiningJobs");
}

function toJob(doc: DbRefiningJob): RefiningJob {
  return {
    id: doc.id,
    location: doc.location,
    locationId: doc.locationId,
    method: doc.method,
    lines: doc.lines ?? [],
    content: doc.content || undefined,
    cost: doc.cost,
    note: doc.note,
    duration: doc.duration,
    startTime: doc.startTime,
    endTime: new Date(
      Date.parse(doc.startTime) + doc.duration * 60_000,
    ).toISOString(),
  };
}

/**
 * Le nom d'un lieu de l'inventaire que le joueur peut utiliser : un lieu de
 * tout le monde ou l'un des siens. Undefined sinon.
 */
async function locationName(
  userId: string,
  locationId: string,
): Promise<string | undefined> {
  if (!ObjectId.isValid(locationId)) return undefined;
  const place = await db
    .db()
    .collection("locations")
    .findOne(
      {
        _id: new ObjectId(locationId),
        $or: [{ userId: { $exists: false } }, { userId }],
      },
      { projection: { name: 1 } },
    );
  return typeof place?.name === "string" ? place.name : undefined;
}

/** Les ordres du joueur, les prêts d'abord puis par fin la plus proche. */
export async function listRefiningJobs(userId: string): Promise<RefiningJob[]> {
  const docs = await jobs()
    .find({ userId: new ObjectId(userId) }, { projection: { _id: 0 } })
    .toArray();
  return sortJobs(docs.map(toJob));
}

export async function getRefiningJob(
  userId: string,
  jobId: string,
): Promise<RefiningJob | null> {
  const doc = await jobs().findOne(
    { id: jobId, userId: new ObjectId(userId) },
    { projection: { _id: 0 } },
  );
  return doc ? toJob(doc) : null;
}

/** Lance le suivi d'un ordre, qui commence maintenant. */
export async function createRefiningJob(
  userId: string,
  input: RefiningJobInput,
): Promise<RefiningJob> {
  const location = await locationName(userId, input.locationId);
  if (location === undefined) {
    throw new RefiningError("invalid_location", 400);
  }

  const doc: DbRefiningJob = {
    id: randomUUID(),
    userId: new ObjectId(userId),
    location,
    locationId: input.locationId,
    method: input.method,
    lines: input.lines,
    cost: input.cost,
    note: input.note,
    duration: input.duration,
    startTime: new Date().toISOString(),
    status: "active",
  };
  await jobs().insertOne(doc);
  return toJob(doc);
}

/**
 * Modifie un ordre. Le départ ne bouge pas : changer la durée déplace la fin.
 * Un ancien ordre perd son texte libre en prenant des lignes.
 */
export async function updateRefiningJob(
  userId: string,
  jobId: string,
  input: RefiningJobInput,
): Promise<RefiningJob> {
  const location = await locationName(userId, input.locationId);
  if (location === undefined) {
    throw new RefiningError("invalid_location", 400);
  }

  const set: Partial<DbRefiningJob> = {
    location,
    locationId: input.locationId,
    lines: input.lines,
    duration: input.duration,
  };
  const unset: Record<string, ""> = { content: "" };
  for (const key of ["method", "cost", "note"] as const) {
    if (input[key] === undefined) unset[key] = "";
    else (set as Record<string, unknown>)[key] = input[key];
  }

  const updated = await jobs().findOneAndUpdate(
    { id: jobId, userId: new ObjectId(userId) },
    { $set: set, $unset: unset },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  if (!updated) throw new RefiningError("not_found", 404);
  return toJob(updated);
}

export async function deleteRefiningJob(userId: string, jobId: string) {
  const result = await jobs().deleteOne({
    id: jobId,
    userId: new ObjectId(userId),
  });
  if (result.deletedCount === 0) throw new RefiningError("not_found", 404);
}

/**
 * Collecte un ordre : ses lignes deviennent des lots de l'inventaire, au lieu
 * choisi (la raffinerie par défaut), et l'ordre est supprimé. Les deux se font
 * dans une transaction : un ordre ne se collecte qu'une fois, et un ajout
 * refusé le laisse en place.
 *
 * Les lots passent par l'ajout rapide (`addInventoryRows`) : un lot du même
 * matériau, de même qualité et même unité au même lieu est complété plutôt
 * que dédoublé. Sans ligne, l'ordre est seulement retiré.
 */
export async function collectRefiningJob(
  userId: string,
  jobId: string,
  input: RefiningCollectInput,
): Promise<{ created: number; merged: number }> {
  if (input.lines.length > 0) {
    if ((await locationName(userId, input.locationId)) === undefined) {
      throw new RefiningError("invalid_location", 400);
    }
  }

  const rows = input.lines.map((line) => ({
    name: line.name,
    quality: line.quality,
    quantity:
      input.unit === "SCU" ? roundQty(line.quantity / 100) : line.quantity,
    unit: input.unit,
    locationId: input.locationId,
    orgVisible: input.orgVisible,
  }));

  const session = db.startSession();
  try {
    return await session.withTransaction(async () => {
      const removed = await jobs().deleteOne(
        { id: jobId, userId: new ObjectId(userId) },
        { session },
      );
      if (removed.deletedCount === 0) {
        throw new RefiningError("not_found", 404);
      }
      if (rows.length === 0) return { created: 0, merged: 0 };

      const added = await addInventoryRows(userId, rows, session);
      if (!added.ok) throw new RefiningError("invalid", 400, added.error);
      return { created: added.created, merged: added.merged };
    });
  } finally {
    await session.endSession();
  }
}
