import "server-only";

import db from "@/lib/db";
import {
  DEFAULT_RADAR_SIGNATURES,
  MAX_RADAR_NAME_LENGTH,
  MAX_RADAR_VALUE,
  isRadarCategory,
  toRadarSignatureId,
  type RadarCategory,
  type RadarSignature,
} from "@/lib/radar";

const COLLECTION = "radarSignatures";

export interface StoredRadarSignature extends RadarSignature {
  createdAt: string;
  updatedAt: string;
}

interface RadarSignatureDbModel extends StoredRadarSignature {
  _id?: unknown;
}

export interface RadarSignatureInput {
  name: string;
  category: RadarCategory;
  value: number;
}

/**
 * L'id est la clé de toute autre opération : son unicité tient à l'index
 * unique que crée `scripts/ensure-indexes.ts`, pas à une lecture préalable.
 */
function collection() {
  return db.db().collection<RadarSignatureDbModel>(COLLECTION);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

function sortSignatures<T extends RadarSignature>(signatures: T[]): T[] {
  return signatures.sort(
    (a, b) => a.value - b.value || a.name.localeCompare(b.name),
  );
}

/** Les signatures enregistrées par les administrateurs, la plus faible d'abord. */
export async function listStoredRadarSignatures(): Promise<
  StoredRadarSignature[]
> {
  const signatures = await collection()
    .find({}, { projection: { _id: 0 } })
    .toArray();

  return sortSignatures(signatures);
}

/**
 * Les signatures que le scanner compare : celles enregistrées, ou la liste
 * par défaut tant qu'aucune ne l'est, pour qu'il marche sur une base neuve.
 */
export async function getRadarSignatures(): Promise<RadarSignature[]> {
  const stored = await listStoredRadarSignatures();

  if (stored.length === 0) {
    return sortSignatures([...DEFAULT_RADAR_SIGNATURES]);
  }

  return stored.map(({ id, name, category, value }) => ({
    id,
    name,
    category,
    value,
  }));
}

export function normalizeRadarSignatureInput(
  input: RadarSignatureInput,
): RadarSignatureInput {
  const name = input.name.trim().slice(0, MAX_RADAR_NAME_LENGTH);
  const value = Math.round(input.value);

  if (!name) {
    throw new Error("Le nom est obligatoire");
  }
  if (!isRadarCategory(input.category)) {
    throw new Error("Catégorie inconnue");
  }
  if (!Number.isFinite(value) || value < 1 || value > MAX_RADAR_VALUE) {
    throw new Error(`La signature doit être entre 1 et ${MAX_RADAR_VALUE}`);
  }

  return { name, category: input.category, value };
}

const MAX_ID_ATTEMPTS = 50;

/**
 * Insère sous l'id tiré du nom, ou le suivant libre s'il est déjà pris.
 *
 * Sur une base vide, la liste par défaut est importée d'abord : sinon la
 * première signature ajoutée remplacerait à elle seule toutes les autres
 * pour le site, l'outil MCP et les apps, qui la gardent en cache.
 */
export async function createRadarSignature(
  input: RadarSignatureInput,
): Promise<StoredRadarSignature> {
  const { name, category, value } = normalizeRadarSignatureInput(input);

  if ((await collection().estimatedDocumentCount()) === 0) {
    await seedDefaultRadarSignatures();
  }
  const base = toRadarSignatureId(name);
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const signature: StoredRadarSignature = {
      id: attempt === 0 ? base : `${base}-${attempt + 1}`,
      name,
      category,
      value,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await collection().insertOne({ ...signature });
      return signature;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  throw new Error(`Aucun identifiant libre pour « ${name} »`);
}

export async function updateRadarSignature(
  id: string,
  input: RadarSignatureInput,
): Promise<void> {
  const { name, category, value } = normalizeRadarSignatureInput(input);

  const result = await collection().updateOne(
    { id },
    { $set: { name, category, value, updatedAt: new Date().toISOString() } },
  );

  if (result.matchedCount === 0) {
    throw new Error("Signature introuvable");
  }
}

export async function deleteRadarSignature(id: string): Promise<void> {
  const result = await collection().deleteOne({ id });

  if (result.deletedCount === 0) {
    throw new Error("Signature introuvable");
  }
}

/**
 * Ajoute les signatures par défaut qui manquent, pour partir de la liste
 * connue plutôt que de la retaper. Celles déjà enregistrées ne bougent pas.
 */
export async function seedDefaultRadarSignatures(): Promise<number> {
  const existing = await collection()
    .find({}, { projection: { id: 1, _id: 0 } })
    .toArray();

  const knownIds = new Set(existing.map((signature) => signature.id));
  const now = new Date().toISOString();

  const missing = DEFAULT_RADAR_SIGNATURES.filter(
    (signature) => !knownIds.has(signature.id),
  ).map((signature) => ({ ...signature, createdAt: now, updatedAt: now }));

  if (missing.length === 0) {
    return 0;
  }

  try {
    const result = await collection().insertMany(missing, { ordered: false });
    return result.insertedCount;
  } catch (error) {
    // Un import concurrent a pu en insérer une partie : l'index unique
    // refuse celles-là, les autres passent.
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    return (
      (error as { result?: { insertedCount?: number } }).result
        ?.insertedCount ?? 0
    );
  }
}
