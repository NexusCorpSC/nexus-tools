import "server-only";

import db from "@/lib/db";
import {
  DEFAULT_TRANSPORTS,
  MAX_SHIP_CAPACITY,
  MAX_SHIP_NAME_LENGTH,
  toShipId,
  type Transport,
} from "@/lib/cargo";

const COLLECTION = "cargoShips";

export interface CargoShip extends Transport {
  createdAt: string;
  updatedAt: string;
}

interface CargoShipDbModel extends CargoShip {
  _id?: unknown;
}

export interface CargoShipInput {
  name: string;
  capacity: number;
}

function collection() {
  return db.db().collection<CargoShipDbModel>(COLLECTION);
}

let indexesReady: Promise<unknown> | null = null;

/**
 * Ids are the key every other operation targets, so uniqueness is enforced by
 * the database rather than by a read-then-write check.
 */
function ensureIndexes() {
  indexesReady ??= collection()
    .createIndex({ id: 1 }, { unique: true, name: "cargoShips_id_unique" })
    .catch((error) => {
      // Let the next call retry instead of caching a transient failure.
      indexesReady = null;
      throw error;
    });

  return indexesReady;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

function sortShips(ships: CargoShip[]): CargoShip[] {
  return ships.sort(
    (a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name),
  );
}

/** Every ship an administrator has registered, smallest capacity first. */
export async function listCargoShips(): Promise<CargoShip[]> {
  const ships = await collection()
    .find({}, { projection: { _id: 0 } })
    .toArray();

  return sortShips(ships);
}

/**
 * Ships offered on the cargo page. Falls back to the built-in list while no
 * ship has been registered, so the tool works on a fresh database.
 */
export async function getAvailableTransports(): Promise<Transport[]> {
  const ships = await listCargoShips();

  if (ships.length === 0) {
    return DEFAULT_TRANSPORTS;
  }

  return ships.map(({ id, name, capacity }) => ({ id, name, capacity }));
}

export function normalizeShipInput(input: CargoShipInput): CargoShipInput {
  const name = input.name.trim().slice(0, MAX_SHIP_NAME_LENGTH);
  const capacity = Math.floor(input.capacity);

  if (!name) {
    throw new Error("Ship name is required");
  }

  if (
    !Number.isFinite(capacity) ||
    capacity < 1 ||
    capacity > MAX_SHIP_CAPACITY
  ) {
    throw new Error("Ship capacity must be between 1 and " + MAX_SHIP_CAPACITY);
  }

  return { name, capacity };
}

const MAX_ID_ATTEMPTS = 50;

/**
 * Inserts under the id derived from the name, taking the next free suffix when
 * it is already taken. The unique index arbitrates, so two concurrent creates
 * cannot end up sharing an id.
 */
export async function createCargoShip(
  input: CargoShipInput,
): Promise<CargoShip> {
  const { name, capacity } = normalizeShipInput(input);
  await ensureIndexes();

  const base = toShipId(name);
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const ship: CargoShip = {
      id: attempt === 0 ? base : `${base}-${attempt + 1}`,
      name,
      capacity,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await collection().insertOne({ ...ship });
      return ship;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  throw new Error(`Could not find a free identifier for "${name}"`);
}

/** Renaming keeps the id: manifests stored in browsers reference it. */
export async function updateCargoShip(
  id: string,
  input: CargoShipInput,
): Promise<void> {
  const { name, capacity } = normalizeShipInput(input);

  const result = await collection().updateOne(
    { id },
    { $set: { name, capacity, updatedAt: new Date().toISOString() } },
  );

  if (result.matchedCount === 0) {
    throw new Error("Ship not found");
  }
}

export async function deleteCargoShip(id: string): Promise<void> {
  const result = await collection().deleteOne({ id });

  if (result.deletedCount === 0) {
    throw new Error("Ship not found");
  }
}

/**
 * Inserts the built-in ships that are missing, so an administrator can start
 * from the known list instead of retyping it. Existing ships are left alone.
 */
export async function seedDefaultCargoShips(): Promise<number> {
  await ensureIndexes();

  const existing = await collection()
    .find({}, { projection: { id: 1, _id: 0 } })
    .toArray();

  const knownIds = new Set(existing.map((ship) => ship.id));
  const now = new Date().toISOString();

  const missing = DEFAULT_TRANSPORTS.filter(
    (transport) => !knownIds.has(transport.id),
  ).map((transport) => ({ ...transport, createdAt: now, updatedAt: now }));

  if (missing.length === 0) {
    return 0;
  }

  try {
    const result = await collection().insertMany(missing, { ordered: false });
    return result.insertedCount;
  } catch (error) {
    // A concurrent seed may have inserted some of them in the meantime; the
    // unique index rejects those and the rest still go through.
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    return (
      (error as { result?: { insertedCount?: number } }).result
        ?.insertedCount ?? 0
    );
  }
}
