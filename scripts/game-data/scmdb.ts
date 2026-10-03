/**
 * scmdb.net comme source des blueprints, des factions et des missions.
 *
 * scmdb publie un manifeste (`/data/versions.json`) et, pour chaque version du
 * jeu, un fichier de missions (`merged-<version>.json`) et un fichier de
 * blueprints (`crafting_blueprints-<version>.json`). Ces fichiers ne sont pas
 * une API documentée : leur forme est vérifiée avant que quoi que ce soit ne
 * soit écrit, et une forme qui a changé arrête l'import au lieu de remplir la
 * base de champs vides.
 *
 * Deux pièges vus sur le site :
 *   - une version retirée du manifeste n'est plus servie, et l'adresse répond
 *     200 avec la page HTML du site au lieu d'un 404 ;
 *   - les fichiers de chaque version sont immuables, donc gardés en cache
 *     local (`.cache/game-data/scmdb/`) : relancer un import ne retélécharge
 *     rien, et une version disparue du site reste importable.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BlueprintRecipe } from "@/types/crafting";
import {
  cleanGameText,
  type GameBlueprint,
  type GameData,
  type GameFaction,
  type GameMission,
} from "./source";

const SCMDB_DATA_URL = "https://scmdb.net/data";
const USER_AGENT = "nexus-tools-import/0.1 (+https://tools.services.nexus)";
export const SCMDB_CACHE_DIR = path.join(
  process.cwd(),
  ".cache",
  "game-data",
  "scmdb",
);

/**
 * Au-delà de cette part d'enregistrements illisibles, ce n'est plus une
 * poignée de lignes abîmées mais un format qui a changé : l'import s'arrête.
 */
const MAX_INVALID_RATIO = 0.02;

export class SourceFormatError extends Error {}

// ─── Forme brute des fichiers ─────────────────────────────────────────────────

type RawManifestEntry = { version: string; file: string };

type RawSlotOption = {
  type: "resource" | "item";
  quantity: number;
  minQuality?: number;
  resourceName?: string;
  itemName?: string;
};

type RawBlueprint = {
  guid: string;
  tag: string;
  productEntityClass: string | null;
  gear: string | null;
  type: string | null;
  subtype: string | null;
  productName: string | null;
  tiers: {
    craftTimeSeconds: number;
    slots: { name: string; options: RawSlotOption[] }[];
  }[];
};

type RawContract = {
  id: string;
  debugName: string;
  debugNames?: string[] | null;
  contractDefinitionIds?: string[] | null;
  category: string | null;
  missionType: string | null;
  title: string;
  description: string | null;
  factionGuid: string | null;
  canBeShared: boolean | null;
  illegal: boolean | null;
  rewardUEC: number | null;
  blueprintRewards?: { blueprintPool: string }[] | null;
};

type RawMissionsFile = {
  version: string;
  factions: Record<string, { name: string; nameKey?: string | null }>;
  blueprintPools: Record<
    string,
    { name: string; blueprints: { blueprintRecord: string }[] }
  >;
  contracts: unknown[];
};

type RawBlueprintsFile = { version: string; blueprints: unknown[] };

// ─── Vérification de forme ────────────────────────────────────────────────────

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isStringOrNull = (value: unknown) => value === null || isString(value);
const isStringList = (value: unknown) =>
  Array.isArray(value) && value.every(isString);

/** Le premier champ qui n'a pas la forme attendue, ou `null`. */
function blueprintProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isString(raw.guid)) return "guid";
  if (!isString(raw.tag)) return "tag";
  if (!isStringOrNull(raw.productName)) return "productName";
  if (!isStringOrNull(raw.productEntityClass ?? null))
    return "productEntityClass";
  if (!isStringOrNull(raw.type ?? null)) return "type";
  if (!isStringOrNull(raw.subtype ?? null)) return "subtype";
  if (!Array.isArray(raw.tiers) || raw.tiers.length === 0) return "tiers";
  const tier = raw.tiers[0];
  if (!isObject(tier) || !isNumber(tier.craftTimeSeconds))
    return "tiers[0].craftTimeSeconds";
  if (!Array.isArray(tier.slots)) return "tiers[0].slots";
  for (const slot of tier.slots) {
    if (!isObject(slot) || !isString(slot.name) || !Array.isArray(slot.options))
      return "tiers[0].slots[].name|options";
    for (const option of slot.options) {
      if (!isObject(option)) return "tiers[0].slots[].options[]";
      if (option.type !== "resource" && option.type !== "item")
        return "tiers[0].slots[].options[].type";
      if (!isNumber(option.quantity))
        return "tiers[0].slots[].options[].quantity";
      if (option.minQuality !== undefined && !isNumber(option.minQuality))
        return "tiers[0].slots[].options[].minQuality";
      const name = option.resourceName ?? option.itemName;
      if (!isString(name)) return "tiers[0].slots[].options[].resourceName";
    }
  }
  return null;
}

function contractProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isString(raw.id)) return "id";
  if (!isString(raw.debugName)) return "debugName";
  if (raw.debugNames != null && !isStringList(raw.debugNames))
    return "debugNames";
  if (
    raw.contractDefinitionIds != null &&
    !isStringList(raw.contractDefinitionIds)
  )
    return "contractDefinitionIds";
  if (!isString(raw.title)) return "title";
  if (!isStringOrNull(raw.description ?? null)) return "description";
  if (!isStringOrNull(raw.category ?? null)) return "category";
  if (!isStringOrNull(raw.missionType ?? null)) return "missionType";
  if (!isStringOrNull(raw.factionGuid ?? null)) return "factionGuid";
  // `null` quand scmdb ne sait pas (une poignée de contrats d'histoire).
  if (raw.canBeShared != null && typeof raw.canBeShared !== "boolean")
    return "canBeShared";
  if (raw.illegal != null && typeof raw.illegal !== "boolean") return "illegal";
  if (raw.rewardUEC != null && !isNumber(raw.rewardUEC)) return "rewardUEC";
  if (raw.blueprintRewards != null) {
    if (!Array.isArray(raw.blueprintRewards)) return "blueprintRewards";
    if (
      !raw.blueprintRewards.every(
        (reward) => isObject(reward) && isString(reward.blueprintPool),
      )
    )
      return "blueprintRewards[].blueprintPool";
  }
  return null;
}

/**
 * Garde les enregistrements lisibles, et s'arrête si trop ne le sont pas.
 * Les problèmes sont comptés par champ : « 1 400 contrats sans `title` » dit
 * tout de suite que scmdb a renommé le champ.
 */
function keepValid<T>(
  label: string,
  rows: unknown[],
  problem: (raw: unknown) => string | null,
  warnings: string[],
): T[] {
  const kept: T[] = [];
  const byField = new Map<string, number>();
  for (const row of rows) {
    const issue = problem(row);
    if (issue) byField.set(issue, (byField.get(issue) ?? 0) + 1);
    else kept.push(row as T);
  }

  const invalid = rows.length - kept.length;
  if (invalid === 0) return kept;

  const detail = [...byField]
    .map(([field, count]) => `${field} (${count})`)
    .join(", ");
  if (rows.length === 0 || invalid / rows.length > MAX_INVALID_RATIO) {
    throw new SourceFormatError(
      `${label} : ${invalid} enregistrement(s) sur ${rows.length} n'ont pas la forme attendue — ${detail}. Le format de scmdb a probablement changé ; rien n'a été écrit.`,
    );
  }
  warnings.push(
    `${label} : ${invalid} enregistrement(s) ignoré(s) — ${detail}`,
  );
  return kept;
}

function checkMissionsFile(raw: unknown): RawMissionsFile {
  if (
    !isObject(raw) ||
    !isString(raw.version) ||
    !isObject(raw.factions) ||
    !isObject(raw.blueprintPools) ||
    !Array.isArray(raw.contracts)
  ) {
    throw new SourceFormatError(
      "Fichier de missions : il manque `version`, `factions`, `blueprintPools` ou `contracts`. Le format de scmdb a probablement changé ; rien n'a été écrit.",
    );
  }
  return raw as unknown as RawMissionsFile;
}

function checkBlueprintsFile(raw: unknown): RawBlueprintsFile {
  if (
    !isObject(raw) ||
    !isString(raw.version) ||
    !Array.isArray(raw.blueprints)
  ) {
    throw new SourceFormatError(
      "Fichier de blueprints : il manque `version` ou `blueprints`. Le format de scmdb a probablement changé ; rien n'a été écrit.",
    );
  }
  return raw as unknown as RawBlueprintsFile;
}

// ─── Conversion ───────────────────────────────────────────────────────────────

function toRecipe(raw: RawBlueprint): BlueprintRecipe {
  const tier = raw.tiers[0];
  return {
    craftingTime: tier.craftTimeSeconds,
    components: tier.slots.map((slot) => ({
      name: slot.name,
      options: slot.options.map((option) => ({
        quantity: option.quantity,
        minQuality: option.minQuality,
        unit: option.type === "resource" ? "SCU" : "unit",
        name: (option.resourceName ?? option.itemName)!,
      })),
    })),
  };
}

function toBlueprint(raw: RawBlueprint): GameBlueprint {
  return {
    gameId: raw.guid,
    tag: raw.tag,
    name: raw.productName?.trim() || null,
    // Les objets de mission n'ont pas de type, seulement leur « gear ».
    category: raw.type ?? raw.gear ?? "other",
    subcategory: raw.subtype ?? undefined,
    productEntityClass: raw.productEntityClass ?? undefined,
    craftingTime: raw.tiers[0].craftTimeSeconds,
    recipe: toRecipe(raw),
  };
}

function toMission(
  raw: RawContract,
  pools: RawMissionsFile["blueprintPools"],
  missingPools: Set<string>,
): GameMission {
  const blueprintGameIds = new Set<string>();
  for (const reward of raw.blueprintRewards ?? []) {
    const pool = pools[reward.blueprintPool];
    if (!pool) {
      missingPools.add(reward.blueprintPool);
      continue;
    }
    for (const entry of pool.blueprints ?? []) {
      if (isString(entry?.blueprintRecord))
        blueprintGameIds.add(entry.blueprintRecord);
    }
  }

  const gameIds = new Set([raw.id, ...(raw.contractDefinitionIds ?? [])]);
  const debugNames = new Set([raw.debugName, ...(raw.debugNames ?? [])]);

  return {
    id: raw.id,
    gameIds: [...gameIds],
    debugNames: [...debugNames],
    category: raw.category ?? "",
    missionType: raw.missionType ?? "",
    title: cleanGameText(raw.title),
    description: cleanGameText(raw.description ?? ""),
    factionGameId: raw.factionGuid,
    canBeShared: raw.canBeShared ?? false,
    illegal: raw.illegal ?? false,
    rewardUEC: raw.rewardUEC ?? undefined,
    blueprintGameIds: [...blueprintGameIds],
  };
}

/** Assemble les deux fichiers d'une même version en `GameData`. */
export function parseScmdb(
  missionsRaw: unknown,
  blueprintsRaw: unknown,
): GameData {
  const missionsFile = checkMissionsFile(missionsRaw);
  const blueprintsFile = checkBlueprintsFile(blueprintsRaw);

  if (missionsFile.version !== blueprintsFile.version) {
    throw new SourceFormatError(
      `Les deux fichiers ne sont pas de la même version : missions ${missionsFile.version}, blueprints ${blueprintsFile.version}.`,
    );
  }

  const warnings: string[] = [];
  const blueprints = keepValid<RawBlueprint>(
    "Blueprints",
    blueprintsFile.blueprints,
    blueprintProblem,
    warnings,
  ).map(toBlueprint);

  const missingPools = new Set<string>();
  const contracts = keepValid<RawContract>(
    "Contrats",
    missionsFile.contracts,
    contractProblem,
    warnings,
  );
  const missions = contracts.map((contract) =>
    toMission(contract, missionsFile.blueprintPools, missingPools),
  );
  if (missingPools.size > 0) {
    warnings.push(
      `${missingPools.size} pool(s) de récompense cité(s) par des contrats mais absent(s) du fichier`,
    );
  }

  // Les factions qui ont un nom affichable en jeu, plus toutes celles qu'un
  // contrat cite : une faction sans `nameKey` mais qui donne des missions
  // doit exister, sinon ses missions perdent leur faction.
  const cited = new Set(
    missions.map((mission) => mission.factionGameId).filter(isString),
  );
  const factions: GameFaction[] = Object.entries(missionsFile.factions)
    .filter(
      ([gameId, faction]) =>
        isObject(faction) &&
        isString(faction.name) &&
        (!!faction.nameKey || cited.has(gameId)),
    )
    .map(([gameId, faction]) => ({ gameId, name: faction.name.trim() }));

  const known = new Set(factions.map((faction) => faction.gameId));
  const orphanMissions = missions.filter(
    (mission) => mission.factionGameId && !known.has(mission.factionGameId),
  ).length;
  if (orphanMissions > 0) {
    warnings.push(
      `${orphanMissions} mission(s) citent une faction absente du fichier`,
    );
  }

  return {
    source: "scmdb",
    version: missionsFile.version,
    blueprints,
    factions,
    missions,
    warnings,
  };
}

// ─── Téléchargement ───────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Un GET qui insiste poliment sur 429/5xx et sur les coupures réseau, et qui
 * refuse une réponse qui n'est pas du JSON : c'est ainsi que scmdb répond
 * pour une version qu'il ne sert plus.
 */
async function fetchJson(url: string, attempts = 4): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    let failure: string;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });

      if (response.ok) {
        const type = response.headers.get("content-type") ?? "";
        if (!type.includes("json")) {
          throw new SourceFormatError(
            `${url} a répondu « ${type || "sans type"} » au lieu de JSON : scmdb ne sert plus ce fichier (version retirée ?).`,
          );
        }
        return await response.json();
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) {
        throw new SourceFormatError(
          `${response.status} ${response.statusText} — ${url}`,
        );
      }
      failure = `${response.status} ${response.statusText}`;
    } catch (error) {
      if (error instanceof SourceFormatError || attempt >= attempts)
        throw error;
      failure = (error as Error).message;
    }

    if (attempt >= attempts) throw new Error(`${failure} — ${url}`);
    await sleep(2000 * attempt);
  }
}

/** Compare deux versions `4.10.1-live.12660092` : numéro, puis build. */
function versionKey(version: string): number[] {
  const match = version.match(/^(\d+(?:\.\d+)*)(?:-[a-z]+)?(?:\.(\d+))?/i);
  if (!match) return [];
  return [...match[1].split(".").map(Number), Number(match[2] ?? 0)];
}

function compareVersions(a: string, b: string): number {
  const left = versionKey(a);
  const right = versionKey(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * La version à importer : celle demandée, sinon la plus récente du LIVE. Le
 * PTU est écarté par défaut : ses missions et recettes changent encore.
 */
export async function resolveScmdbVersion(requested?: string): Promise<string> {
  const manifest = await fetchJson(`${SCMDB_DATA_URL}/versions.json`);
  if (
    !Array.isArray(manifest) ||
    !manifest.every(
      (entry): entry is RawManifestEntry =>
        isObject(entry) && isString(entry.version),
    )
  ) {
    throw new SourceFormatError(
      "Le manifeste de scmdb (versions.json) n'a pas la forme attendue.",
    );
  }

  const versions = manifest.map((entry) => entry.version);
  if (requested) {
    if (!versions.includes(requested)) {
      console.warn(
        `La version ${requested} n'est plus au manifeste de scmdb (${versions.join(", ")}) : seul le cache local peut encore la fournir.`,
      );
    }
    return requested;
  }

  const live = versions
    .filter((version) => /-live\./i.test(version))
    .sort(compareVersions)
    .pop();
  if (!live) {
    throw new SourceFormatError(
      `Aucune version LIVE au manifeste de scmdb : ${versions.join(", ")}`,
    );
  }
  return live;
}

async function readCached(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path.join(SCMDB_CACHE_DIR, file), "utf8"));
  } catch {
    return undefined;
  }
}

/** Le fichier depuis le cache, sinon depuis scmdb, mis en cache une fois lu. */
async function loadFile(file: string): Promise<unknown> {
  const cached = await readCached(file);
  if (cached !== undefined) {
    console.log(`  ${file} (cache)`);
    return cached;
  }

  console.log(`  ${file} (téléchargement)`);
  const data = await fetchJson(`${SCMDB_DATA_URL}/${file}`);
  await mkdir(SCMDB_CACHE_DIR, { recursive: true });
  await writeFile(path.join(SCMDB_CACHE_DIR, file), JSON.stringify(data));
  return data;
}

/** Les données d'une version, depuis scmdb (ou le cache). */
export async function loadScmdb(version: string): Promise<GameData> {
  const [missions, blueprints] = await Promise.all([
    loadFile(`merged-${version}.json`),
    loadFile(`crafting_blueprints-${version}.json`),
  ]);
  return parseScmdb(missions, blueprints);
}

/**
 * Les données depuis deux fichiers locaux, pour importer hors ligne ou
 * rejouer un ancien export. Un dossier est aussi accepté : il doit contenir
 * un `merged-*.json` et un `crafting_blueprints-*.json` de la même version.
 */
export async function loadScmdbFiles(
  missionsPath: string,
  blueprintsPath: string,
): Promise<GameData> {
  const [missions, blueprints] = await Promise.all([
    readFile(missionsPath, "utf8").then(JSON.parse),
    readFile(blueprintsPath, "utf8").then(JSON.parse),
  ]);
  return parseScmdb(missions, blueprints);
}

export async function findScmdbFiles(
  dir: string,
  version?: string,
): Promise<{ missions: string; blueprints: string }> {
  const files = await readdir(dir);
  const versions = files
    .map((file) => file.match(/^merged-(.+)\.json$/)?.[1])
    .filter(isString)
    .filter((found) => files.includes(`crafting_blueprints-${found}.json`))
    .sort(compareVersions);
  const chosen = version ?? versions.pop();
  if (!chosen || !files.includes(`merged-${chosen}.json`)) {
    throw new Error(
      `${dir} ne contient pas de paire merged-<version>.json / crafting_blueprints-<version>.json${version ? ` pour ${version}` : ""}.`,
    );
  }
  return {
    missions: path.join(dir, `merged-${chosen}.json`),
    blueprints: path.join(dir, `crafting_blueprints-${chosen}.json`),
  };
}
