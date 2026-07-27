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

/** Derives an id from the name, suffixing it until it is free. */
async function uniqueShipId(name: string): Promise<string> {
  const base = toShipId(name);
  let candidate = base;
  let suffix = 2;

  while (
    await collection().findOne({ id: candidate }, { projection: { id: 1 } })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function createCargoShip(
  input: CargoShipInput,
): Promise<CargoShip> {
  const { name, capacity } = normalizeShipInput(input);
  const now = new Date().toISOString();

  const ship: CargoShip = {
    id: await uniqueShipId(name),
    name,
    capacity,
    createdAt: now,
    updatedAt: now,
  };

  await collection().insertOne({ ...ship });

  return ship;
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

  await collection().insertMany(missing);

  return missing.length;
}
