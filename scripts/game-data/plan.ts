/**
 * Ce que l'import va écrire, calculé en mémoire avant toute écriture : la
 * simulation (`--dry-run`) montre exactement ce que l'import ferait, et un
 * import qui échoue en cours de calcul n'a rien touché.
 *
 * Trois règles tiennent tout le reste :
 *   - une fiche est retrouvée par l'identifiant du jeu, jamais par son nom ;
 *     son `_id`, donc les possessions des joueurs et les liens, ne bouge pas ;
 *   - ce qu'un administrateur a saisi à la main (nom, description, slug,
 *     image, statistiques, obtention) n'est pas écrasé ;
 *   - ce qui disparaît du jeu est marqué `removedInVersion`, pas supprimé.
 */

import { isDeepStrictEqual } from "node:util";
import { ObjectId } from "bson";
import type { BlueprintRecipe } from "@/types/crafting";
import {
  isPlaceholderTitle,
  recipeFingerprint,
  recipeSignature,
  toBlueprintSlug,
  type GameBlueprint,
  type GameData,
  type GameMission,
} from "./source";

// ─── Documents en base ────────────────────────────────────────────────────────

type ImportSource = { name: GameData["source"]; version: string };

export type BlueprintDoc = {
  _id: ObjectId;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  subcategory?: string;
  imageUrl?: string | null;
  tier?: number;
  craftingTime?: number;
  statistics?: Record<string, unknown>;
  recipe?: BlueprintRecipe;
  obtention?: string;
  gameId?: string;
  gameName?: string;
  gameTag?: string;
  productEntityClass?: string;
  previousSlugs?: string[];
  removedInVersion?: string;
  generatedObtention?: string;
  source?: ImportSource;
};

export type FactionDoc = {
  _id: ObjectId;
  name: string;
  gameId?: string;
};

export type MissionDoc = {
  _id: ObjectId;
  id?: string;
  gameIds?: string[];
  debugNames?: string[];
  category?: string;
  missionType?: string;
  title?: string;
  description?: string;
  factionId?: ObjectId | null;
  canBeShared?: boolean;
  illegal?: boolean;
  rewardUEC?: number | null;
  blueprints?: ObjectId[];
  removedInVersion?: string;
  replacedBy?: ObjectId;
  source?: ImportSource;
};

export type DocUpdate = {
  _id: ObjectId;
  set: Record<string, unknown>;
  unset: string[];
};

export type Changes<T> = {
  inserts: T[];
  updates: DocUpdate[];
  /** L'état de la collection une fois les écritures faites. */
  docs: T[];
};

// ─── Suivi des modifications ──────────────────────────────────────────────────

/**
 * Deux valeurs égales pour Mongo : `null` et une clé absente se valent (le
 * pilote enregistre `undefined` comme `null`), et un `ObjectId` vaut son hex.
 */
function canonical(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value ?? null, (_key, item) =>
      item === null ? undefined : item,
    ) ?? "null",
  );
}

export function sameValue(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(canonical(a), canonical(b));
}

/** Retire les clés `undefined`, que Mongo écrirait `null`. */
function compact<T extends object>(doc: T): T {
  return Object.fromEntries(
    Object.entries(doc).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * Accumule les modifications d'un document en les appliquant à sa copie de
 * travail : la suite du calcul voit déjà le document tel qu'il sera écrit.
 */
class Tracker<T extends { _id: ObjectId }> {
  private pending = new Map<string, DocUpdate>();

  change(doc: T, key: string, value: unknown) {
    const record = doc as Record<string, unknown>;
    if (value === undefined) {
      if (record[key] === undefined || record[key] === null) return;
      delete record[key];
      this.entry(doc).unset.push(key);
      return;
    }
    if (sameValue(record[key], value)) return;
    record[key] = value;
    this.entry(doc).set[key] = value;
  }

  changed(doc: T): boolean {
    return this.pending.has(doc._id.toHexString());
  }

  updates(): DocUpdate[] {
    return [...this.pending.values()];
  }

  private entry(doc: T): DocUpdate {
    const key = doc._id.toHexString();
    let entry = this.pending.get(key);
    if (!entry) {
      entry = { _id: doc._id, set: {}, unset: [] };
      this.pending.set(key, entry);
    }
    return entry;
  }
}

/** Au plus `limit` exemples, pour un rapport qui reste lisible. */
export type Report = {
  counts: Record<string, number>;
  samples: Record<string, string[]>;
};

export function newReport(): Report {
  return { counts: {}, samples: {} };
}

export function note(report: Report, key: string, sample?: string) {
  report.counts[key] = (report.counts[key] ?? 0) + 1;
  if (sample !== undefined) (report.samples[key] ??= []).push(sample);
}

/**
 * Au-delà de cette part de fiches marquées disparues en un seul import, la
 * source est plus probablement tronquée que le jeu vidé : l'import s'arrête
 * plutôt que de retirer la moitié du catalogue.
 */
const MAX_REMOVED_RATIO = 0.2;

export class MassRemovalError extends Error {}

function guardRemovals(label: string, removed: number, active: number) {
  if (active > 20 && removed / active > MAX_REMOVED_RATIO) {
    throw new MassRemovalError(
      `${label} : ${removed} fiche(s) sur ${active} disparaîtraient du jeu d'un coup. La source est probablement incomplète ; rien n'a été écrit (forcer avec --allow-mass-removal).`,
    );
  }
}

// ─── Blueprints ───────────────────────────────────────────────────────────────

const autoDescription = (name: string) => `Blueprint pour fabriquer ${name}`;

/** Le suffixe qui départage deux homonymes : `BP_CRAFT_COOL_TYDT_S02_HeatSink_SCItem` → `cool-tydt-s02-heatsink`. */
function tagSuffix(tag: string): string {
  return toBlueprintSlug(
    tag.replace(/^BP_CRAFT_/i, "").replace(/_SCItem$/i, ""),
  );
}

/**
 * Le slug a-t-il été dérivé de ce nom par un import (tel quel, ou départagé
 * d'un homonyme), ou choisi par un administrateur ?
 */
function isAutoSlug(slug: string, name: string, tag?: string): boolean {
  const base = toBlueprintSlug(name);
  const suffixed = tag ? `${base}-${tagSuffix(tag)}` : base;
  return (
    slug === base ||
    slug === suffixed ||
    // Un slug ne contient que [a-z0-9-] : rien à échapper.
    new RegExp(`^${suffixed}-\\d+$`).test(slug)
  );
}

export type BlueprintOptions = {
  version: string;
  source: GameData["source"];
  allowMassRemoval: boolean;
};

export type BlueprintChanges = Changes<BlueprintDoc> & {
  /** Slugs déplacés par un renommage, ancien → nouveau. */
  slugMoves: Map<string, string>;
  /**
   * Les blueprints dont la recette est à demander à la source : nouveaux, ou
   * dont les ingrédients ne sont plus ceux de la recette en base. Le calcul
   * est à refaire une fois leurs recettes connues.
   */
  needsRecipe: string[];
  report: Report;
};

/**
 * La recette en base est-elle encore celle du jeu ? Avec la recette complète,
 * on compare tout ; sans (le wiki ne la donne qu'au détail), on compare les
 * ingrédients et le temps.
 */
function sameRecipe(
  record: GameBlueprint,
  recipe: BlueprintRecipe | undefined,
) {
  return record.recipe
    ? recipeSignature(record.recipe) === recipeSignature(recipe)
    : record.fingerprint === recipeFingerprint(recipe);
}

function groupByName(records: GameBlueprint[]) {
  const byName = new Map<string, GameBlueprint[]>();
  for (const record of records) {
    if (!record.name) continue;
    const list = byName.get(record.name) ?? [];
    list.push(record);
    byName.set(record.name, list);
  }
  return byName;
}

/**
 * Rapproche les blueprints de la source des fiches en base.
 *
 * `legacy` sert une seule fois : pour les fiches importées avant les GUID,
 * il donne le nom sous lequel chacune a été importée (celui de l'ancien
 * export), ce qui retrouve son GUID même si le jeu l'a renommée depuis. Sans
 * lui, une fiche dont le nom a changé n'est pas reconnue.
 */
export function planBlueprints(
  existing: BlueprintDoc[],
  incoming: GameBlueprint[],
  legacy: GameBlueprint[] | undefined,
  options: BlueprintOptions,
): BlueprintChanges {
  const report = newReport();
  const tracker = new Tracker<BlueprintDoc>();
  const docs = existing.map((doc) => ({ ...doc }));
  const source: ImportSource = {
    name: options.source,
    version: options.version,
  };

  const records = incoming
    .filter((record) => {
      if (record.name) return true;
      note(report, "ignorés (sans nom en jeu)", record.tag);
      return false;
    })
    .sort((a, b) => a.gameId.localeCompare(b.gameId));
  const recordIds = new Set(records.map((record) => record.gameId));

  const byGameId = new Map<string, BlueprintDoc>();
  for (const doc of docs) {
    if (!doc.gameId) continue;
    if (byGameId.has(doc.gameId)) {
      note(
        report,
        "GUID en double en base (seule la première fiche est suivie)",
        doc.name,
      );
      continue;
    }
    byGameId.set(doc.gameId, doc);
  }

  // Fiches importées avant les GUID : retrouvées par le nom sous lequel
  // elles ont été importées, et départagées par leur recette quand plusieurs
  // blueprints portaient ce nom. Une fiche absente de l'ancien export (créée
  // depuis, à la main ou par un autre script) est retrouvée ensuite par son
  // nom dans la source : sinon l'import en crée une seconde.
  const legacyByName = groupByName(legacy ?? incoming);
  const incomingByName = legacy ? groupByName(incoming) : undefined;
  const unmatched: BlueprintDoc[] = [];
  for (const doc of docs) {
    if (doc.gameId) continue;
    const named = legacyByName.get(doc.name);
    if (!named) {
      unmatched.push(doc);
      continue;
    }
    let candidates = named.filter((record) => !byGameId.has(record.gameId));
    if (candidates.length > 1) {
      candidates = candidates.filter((record) =>
        sameRecipe(record, doc.recipe),
      );
      // Même nom et même recette : des variantes que rien ne distingue sur
      // la fiche. L'ancien import, qui cherchait par nom, a écrit chacune par
      // dessus la précédente : la fiche porte la dernière.
      if (candidates.length > 1) {
        note(
          report,
          "homonymes à recette identique, départagés par l'ordre de l'ancien export",
          doc.name,
        );
        candidates = candidates.slice(-1);
      }
    }
    adopt(doc, named, candidates);
  }
  // Après l'ancien export, pour ne pas prendre le GUID d'une fiche qu'il
  // aurait rattachée.
  for (const doc of unmatched) {
    const named = incomingByName?.get(doc.name);
    if (!named) {
      note(
        report,
        "fiches sans équivalent dans la source (saisies à la main ?)",
        doc.name,
      );
      continue;
    }
    let candidates = named.filter((record) => !byGameId.has(record.gameId));
    if (candidates.length > 1) {
      candidates = candidates.filter((record) =>
        sameRecipe(record, doc.recipe),
      );
    }
    if (candidates.length === 1) {
      note(
        report,
        "fiches absentes de l'ancien export, rattachées par leur nom",
      );
    }
    adopt(doc, named, candidates);
  }

  function adopt(
    doc: BlueprintDoc,
    named: GameBlueprint[],
    candidates: GameBlueprint[],
  ) {
    if (candidates.length === 1) {
      tracker.change(doc, "gameId", candidates[0].gameId);
      tracker.change(doc, "gameName", doc.name);
      byGameId.set(candidates[0].gameId, doc);
      note(report, "fiches existantes rattachées à leur GUID");
    } else if (candidates.length > 1) {
      note(
        report,
        "fiches existantes ambiguës, laissées telles quelles",
        doc.name,
      );
    } else if (named.some((record) => recordIds.has(record.gameId))) {
      // Le blueprint de la source a déjà sa fiche : celle-ci fait doublon
      // (voir `npm run merge:blueprints`).
      note(
        report,
        "doublons : fiche sans GUID d'un blueprint qui a déjà la sienne (npm run merge:blueprints)",
        doc.name,
      );
    } else {
      note(
        report,
        "fiches sans équivalent dans la source (saisies à la main ?)",
        doc.name,
      );
    }
  }

  // Les champs que la source décide.
  const inserted: BlueprintDoc[] = [];
  const oldNames = new Map<BlueprintDoc, string>();
  const needsRecipe: string[] = [];
  for (const record of records) {
    const name = record.name!;
    const doc = byGameId.get(record.gameId);

    if (!doc) {
      if (!record.recipe) needsRecipe.push(record.gameId);
      const created: BlueprintDoc = compact({
        _id: new ObjectId(),
        name,
        slug: "",
        description: autoDescription(name),
        category: record.category,
        subcategory: record.subcategory ?? undefined,
        tier: 0,
        craftingTime: record.craftingTime,
        statistics: {},
        recipe: record.recipe,
        obtention: "",
        gameId: record.gameId,
        gameName: name,
        gameTag: record.tag,
        productEntityClass: record.productEntityClass,
        source,
      });
      inserted.push(created);
      byGameId.set(record.gameId, created);
      note(report, "créés", name);
      continue;
    }

    oldNames.set(doc, doc.name);
    const importedName = doc.gameName ?? doc.name;
    if (doc.name === importedName && name !== doc.name) {
      if (!doc.description || doc.description === autoDescription(doc.name)) {
        tracker.change(doc, "description", autoDescription(name));
      }
      note(report, "renommés par le jeu", `${doc.name} → ${name}`);
      tracker.change(doc, "name", name);
    } else if (doc.name !== importedName && name !== importedName) {
      note(
        report,
        "renommés par le jeu, nom personnalisé gardé",
        `${doc.name} (jeu : ${importedName} → ${name})`,
      );
    }
    tracker.change(doc, "gameName", name);
    tracker.change(doc, "gameTag", record.tag);
    tracker.change(doc, "productEntityClass", record.productEntityClass);
    tracker.change(doc, "category", record.category);
    // `undefined` : la source ne la connaît pas, la fiche garde la sienne.
    if (record.subcategory !== undefined)
      tracker.change(doc, "subcategory", record.subcategory ?? undefined);
    tracker.change(doc, "craftingTime", record.craftingTime);
    if (record.recipe) tracker.change(doc, "recipe", record.recipe);
    else if (!sameRecipe(record, doc.recipe)) needsRecipe.push(record.gameId);
    if (doc.removedInVersion) {
      tracker.change(doc, "removedInVersion", undefined);
      note(report, "revenus en jeu", name);
    }
  }

  // Ce que le jeu ne fournit plus.
  const active = docs.filter((doc) => doc.gameId && !doc.removedInVersion);
  const gone = active.filter((doc) => !recordIds.has(doc.gameId!));
  if (!options.allowMassRemoval)
    guardRemovals("Blueprints", gone.length, active.length);
  for (const doc of gone) {
    tracker.change(doc, "removedInVersion", options.version);
    note(report, "disparus du jeu (marqués, pas supprimés)", doc.name);
  }

  // Les slugs, en deux temps : ceux qui restent d'abord, puis ceux qui
  // bougent ou naissent.
  const claimed = new Set<string>();
  const movers: BlueprintDoc[] = [];
  // Ceux qui bougent parce que le jeu les a renommés : leur ancien slug
  // redirige. Les autres bougent parce qu'un doublon tenait déjà leur slug,
  // qui reste alors à l'autre fiche.
  const renamed = new Set<BlueprintDoc>();
  const followed = new Set(
    records.map((record) => byGameId.get(record.gameId)!),
  );
  for (const doc of docs) {
    if (!followed.has(doc)) claimed.add(doc.slug);
  }
  for (const doc of docs.filter((doc) => followed.has(doc))) {
    const before = oldNames.get(doc) ?? doc.name;
    const wantsMove =
      doc.name !== before &&
      isAutoSlug(doc.slug, before, doc.gameTag) &&
      !isAutoSlug(doc.slug, doc.name, doc.gameTag);
    if (wantsMove) renamed.add(doc);
    if (wantsMove || !doc.slug || claimed.has(doc.slug)) movers.push(doc);
    else claimed.add(doc.slug);
  }

  // Un slug qui redirige vers une fiche (son ancien slug, ou celui qu'elle
  // quitte maintenant) lui reste réservé : les liens partagés vers elle ne
  // doivent pas mener à une autre, même si celle-ci prend son ancien nom.
  const redirects = new Map<string, BlueprintDoc>();
  for (const doc of docs) {
    for (const old of doc.previousSlugs ?? []) {
      if (!redirects.has(old)) redirects.set(old, doc);
    }
  }
  for (const doc of renamed) redirects.set(doc.slug, doc);
  const isFree = (candidate: string, doc: BlueprintDoc) =>
    !claimed.has(candidate) && (redirects.get(candidate) ?? doc) === doc;

  const slugMoves = new Map<string, string>();
  const place = (doc: BlueprintDoc) => {
    const base =
      toBlueprintSlug(doc.name) || tagSuffix(doc.gameTag ?? "") || "blueprint";
    const suffixed = doc.gameTag ? `${base}-${tagSuffix(doc.gameTag)}` : base;
    let slug = [base, suffixed].find((candidate) => isFree(candidate, doc));
    for (let i = 2; !slug; i++) {
      if (isFree(`${suffixed}-${i}`, doc)) slug = `${suffixed}-${i}`;
    }
    claimed.add(slug);
    return slug;
  };
  for (const doc of movers) {
    const slug = place(doc);
    if (renamed.has(doc) && slug !== doc.slug) {
      slugMoves.set(doc.slug, slug);
      const previous = [...new Set([...(doc.previousSlugs ?? []), doc.slug])];
      tracker.change(
        doc,
        "previousSlugs",
        previous.filter((old) => old !== slug),
      );
      note(
        report,
        "slugs déplacés (l'ancien redirige)",
        `${doc.slug} → ${slug}`,
      );
    }
    tracker.change(doc, "slug", slug);
  }
  for (const doc of inserted) doc.slug = place(doc);

  // `source` en dernier : il ne compte comme modification que pour une fiche
  // qui en a déjà une autre, sans quoi chaque nouvelle version réécrirait
  // tout le catalogue pour un numéro.
  for (const record of records) {
    const doc = byGameId.get(record.gameId)!;
    if (!oldNames.has(doc)) continue;
    if (tracker.changed(doc) || !doc.source)
      tracker.change(doc, "source", source);
  }

  const updates = tracker.updates();
  const fresh = new Set(inserted);
  report.counts["mis à jour"] = updates.length;
  report.counts["inchangés"] = records.filter((record) => {
    const doc = byGameId.get(record.gameId)!;
    return !fresh.has(doc) && !tracker.changed(doc);
  }).length;

  return {
    inserts: inserted,
    updates,
    docs: [...docs, ...inserted],
    slugMoves,
    needsRecipe,
    report,
  };
}

// ─── Factions ─────────────────────────────────────────────────────────────────

/** Le nom d'une faction tel qu'on le compare : la casse et les espaces varient d'une source à l'autre. */
export const factionKey = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

/** `<= PLACEHOLDER =>`, `[PH] Hostile` : des factions que le jeu n'a pas encore nommées. */
const isPlaceholderFaction = (name: string) => /<=.*=>|^\[PH\]/i.test(name);

export type FactionChanges = Changes<FactionDoc> & {
  byGameId: Map<string, FactionDoc>;
  byName: Map<string, FactionDoc>;
  report: Report;
};

/**
 * Rapproche les factions de la source des fiches en base : par identifiant
 * de jeu, sinon par nom. Les deux sources n'ont pas les mêmes identifiants de
 * faction, et les fiches d'avant cet import n'en ont aucun : une faction
 * retrouvée par son nom prend l'identifiant de la source.
 */
export function planFactions(
  existing: FactionDoc[],
  data: GameData,
): FactionChanges {
  const report = newReport();
  const tracker = new Tracker<FactionDoc>();
  const docs = existing.map((doc) => ({ ...doc }));
  const byGameId = new Map<string, FactionDoc>();
  for (const doc of docs) if (doc.gameId) byGameId.set(doc.gameId, doc);

  const matched = new Map<string, FactionDoc>();
  for (const faction of data.factions) {
    const doc = byGameId.get(faction.gameId);
    if (doc) matched.set(faction.gameId, doc);
  }
  const taken = new Set(matched.values());
  const byExistingName = new Map<string, FactionDoc>();
  for (const doc of docs) {
    const key = factionKey(doc.name);
    if (!taken.has(doc) && !byExistingName.has(key))
      byExistingName.set(key, doc);
  }

  const inserts: FactionDoc[] = [];
  for (const faction of data.factions) {
    // Leurs missions restent sans faction.
    if (isPlaceholderFaction(faction.name)) {
      note(report, "ignorées (nom provisoire du jeu)", faction.name);
      byGameId.delete(faction.gameId);
      continue;
    }
    let doc = matched.get(faction.gameId);
    if (!doc) {
      const named = byExistingName.get(factionKey(faction.name));
      if (named && !taken.has(named)) {
        doc = named;
        taken.add(doc);
        if (doc.gameId) byGameId.delete(doc.gameId);
        tracker.change(doc, "gameId", faction.gameId);
        byGameId.set(faction.gameId, doc);
        note(report, "rattachées à leur identifiant par leur nom");
      }
    }
    if (!doc) {
      const created = {
        _id: new ObjectId(),
        name: faction.name,
        gameId: faction.gameId,
      };
      inserts.push(created);
      byGameId.set(faction.gameId, created);
      note(report, "créées", faction.name);
      continue;
    }
    if (doc.name !== faction.name)
      note(report, "renommées", `${doc.name} → ${faction.name}`);
    tracker.change(doc, "name", faction.name);
  }

  const all = [...docs, ...inserts];
  const byName = new Map<string, FactionDoc>();
  for (const doc of all) {
    const key = factionKey(doc.name);
    if (!byName.has(key) && !isPlaceholderFaction(doc.name))
      byName.set(key, doc);
  }

  const updates = tracker.updates();
  report.counts["mises à jour"] = updates.length;
  return { inserts, updates, docs: all, byGameId, byName, report };
}

// ─── Missions ─────────────────────────────────────────────────────────────────

/** Les clés sous lesquelles une mission peut être reconnue d'un import à l'autre. */
function missionKeys(
  ids: Iterable<string>,
  debugNames: Iterable<string>,
): string[] {
  return [
    ...[...ids].map((id) => `id:${id}`),
    ...[...debugNames].map((name) => `dn:${name}`),
  ];
}

/**
 * La force du lien entre un contrat de la source et une mission en base :
 * le même identifiant principal l'emporte sur tout, puis les identifiants de
 * définition partagés, puis les noms techniques partagés.
 */
function matchScore(
  mission: GameMission,
  doc: MissionDoc,
  docKeys: Set<string>,
): number {
  let score = doc.id === mission.id ? 1000 : 0;
  for (const id of mission.gameIds) if (docKeys.has(`id:${id}`)) score += 10;
  for (const name of mission.debugNames)
    if (docKeys.has(`dn:${name}`)) score += 1;
  return score;
}

export type MissionOptions = BlueprintOptions;

/**
 * Rapproche les contrats de la source des missions en base, sans jamais
 * recréer une mission déjà là : son `_id` est dans les liens partagés.
 *
 * scmdb regroupe les variantes d'une mission sous un identifiant principal
 * qui change d'un patch à l'autre (120 sur 1 437 entre 4.8.1 et 4.10.1). Un
 * contrat est donc rapproché par tout ce qui le désigne — identifiant
 * principal, identifiants de définition, noms techniques — et chaque mission
 * en base ne sert qu'une fois, au contrat qui lui ressemble le plus.
 *
 * `legacy` complète les missions importées avant ce script, qui n'ont gardé
 * que leur identifiant principal : l'ancien export redonne leurs noms
 * techniques.
 */
export function planMissions(
  existing: MissionDoc[],
  data: GameData,
  legacy: GameMission[] | undefined,
  factions: Pick<FactionChanges, "byGameId" | "byName">,
  blueprints: Map<string, BlueprintDoc>,
  options: MissionOptions,
): Changes<MissionDoc> & { report: Report } {
  const report = newReport();
  const tracker = new Tracker<MissionDoc>();
  const docs = existing.map((doc) => ({ ...doc }));
  const source: ImportSource = {
    name: options.source,
    version: options.version,
  };

  const legacyById = new Map(
    (legacy ?? []).map((mission) => [mission.id, mission]),
  );
  const keysOf = new Map<MissionDoc, Set<string>>();
  const index = new Map<string, MissionDoc[]>();
  for (const doc of docs) {
    const old = doc.id ? legacyById.get(doc.id) : undefined;
    const keys = new Set(
      missionKeys(
        [
          ...(doc.id ? [doc.id] : []),
          ...(doc.gameIds ?? []),
          ...(old?.gameIds ?? []),
        ],
        [...(doc.debugNames ?? []), ...(old?.debugNames ?? [])],
      ),
    );
    keysOf.set(doc, keys);
    for (const key of keys) {
      const list = index.get(key) ?? [];
      list.push(doc);
      index.set(key, list);
    }
  }

  // Toutes les paires possibles, les plus sûres d'abord.
  const pairs: { mission: GameMission; doc: MissionDoc; score: number }[] = [];
  for (const mission of data.missions) {
    const candidates = new Set<MissionDoc>();
    for (const key of missionKeys(mission.gameIds, mission.debugNames)) {
      for (const doc of index.get(key) ?? []) candidates.add(doc);
    }
    for (const doc of candidates) {
      pairs.push({
        mission,
        doc,
        score: matchScore(mission, doc, keysOf.get(doc)!),
      });
    }
  }
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      a.mission.id.localeCompare(b.mission.id) ||
      a.doc._id.toHexString().localeCompare(b.doc._id.toHexString()),
  );

  const docFor = new Map<GameMission, MissionDoc>();
  const taken = new Set<MissionDoc>();
  for (const { mission, doc } of pairs) {
    if (docFor.has(mission) || taken.has(doc)) continue;
    docFor.set(mission, doc);
    taken.add(doc);
  }

  const missingBlueprints = new Set<string>();
  let withoutFaction = 0;
  /**
   * La faction par son identifiant, sinon par le nom du donneur de mission ;
   * `undefined` si elle reste introuvable (faction absente de la source ou au
   * nom provisoire) : la fiche garde alors la sienne.
   */
  const factionOf = (mission: GameMission) => {
    const found =
      (mission.factionGameId
        ? factions.byGameId.get(mission.factionGameId)
        : undefined) ??
      (mission.factionName
        ? factions.byName.get(factionKey(mission.factionName))
        : undefined);
    if (found) return found._id;
    withoutFaction += 1;
    return undefined;
  };
  // Les blueprints que l'import suit (par GUID). Un lien vers un autre — saisi
  // à la main, ou une fiche ancienne qu'il n'a pas pu rattacher — n'est pas le
  // sien : il le garde.
  const followed = new Set(
    [...blueprints.values()].map((blueprint) => blueprint._id.toHexString()),
  );
  // Une clé `undefined` : la source ne sait pas, la fiche garde sa valeur.
  const fields = (mission: GameMission, doc?: MissionDoc) => {
    const blueprintIds: ObjectId[] = (doc?.blueprints ?? []).filter(
      (id) => !followed.has(id.toHexString()),
    );
    for (const gameId of mission.blueprintGameIds) {
      const blueprint = blueprints.get(gameId);
      if (blueprint) blueprintIds.push(blueprint._id);
      else missingBlueprints.add(gameId);
    }
    return {
      id: mission.id,
      gameIds: mission.gameIds,
      debugNames: mission.debugNames,
      category: mission.category,
      missionType: mission.missionType,
      title: isPlaceholderTitle(mission.title) ? undefined : mission.title,
      description: mission.description,
      factionId: factionOf(mission),
      canBeShared: mission.canBeShared,
      illegal: mission.illegal,
      rewardUEC: mission.rewardUEC,
      blueprints: blueprintIds,
    };
  };

  const inserts: MissionDoc[] = [];
  for (const mission of data.missions) {
    const doc = docFor.get(mission);
    if (!doc) {
      if (isPlaceholderTitle(mission.title)) {
        note(
          report,
          "ignorées (titre non résolu par la source)",
          mission.title,
        );
        continue;
      }
      const values = fields(mission);
      inserts.push(
        compact({
          _id: new ObjectId(),
          ...values,
          factionId: values.factionId ?? null,
          missionType: values.missionType ?? "",
          source,
        }),
      );
      note(report, "créées", mission.title);
      continue;
    }
    for (const [key, value] of Object.entries(fields(mission, doc))) {
      if (value !== undefined) tracker.change(doc, key, value);
    }
    if (doc.removedInVersion) {
      tracker.change(doc, "removedInVersion", undefined);
      tracker.change(doc, "replacedBy", undefined);
      note(report, "revenues en jeu", mission.title);
    }
    if (tracker.changed(doc) || !doc.source)
      tracker.change(doc, "source", source);
  }

  // Les missions que plus aucun contrat ne désigne. Celle qu'un contrat
  // désignait encore, mais au profit d'une autre fiche, a été fusionnée par
  // la source : sa page renverra vers la mission qui l'a absorbée.
  const absorbedBy = new Map<MissionDoc, MissionDoc>();
  for (const { mission, doc } of pairs) {
    if (taken.has(doc) || absorbedBy.has(doc)) continue;
    const winner = docFor.get(mission);
    if (winner) absorbedBy.set(doc, winner);
  }
  const gone = docs.filter((doc) => !taken.has(doc) && !doc.removedInVersion);
  // Une mission fusionnée reste joignable : seules les vraies disparitions
  // disent que la source est tronquée.
  if (!options.allowMassRemoval) {
    guardRemovals(
      "Missions",
      gone.filter((doc) => !absorbedBy.has(doc)).length,
      docs.filter((doc) => !doc.removedInVersion).length,
    );
  }
  for (const doc of gone) {
    tracker.change(doc, "removedInVersion", options.version);
    const winner = absorbedBy.get(doc);
    if (winner) {
      tracker.change(doc, "replacedBy", winner._id);
      note(
        report,
        "fusionnées dans une autre mission (redirigées)",
        `${doc.title} → ${winner.title}`,
      );
    } else {
      note(
        report,
        "disparues du jeu (marquées, pas supprimées)",
        doc.title ?? "",
      );
    }
  }

  if (missingBlueprints.size > 0) {
    report.counts["blueprints récompensés introuvables en base"] =
      missingBlueprints.size;
    report.samples["blueprints récompensés introuvables en base"] = [
      ...missingBlueprints,
    ];
  }
  if (withoutFaction > 0)
    report.counts["sans faction retrouvée (la fiche garde la sienne)"] =
      withoutFaction;

  const updates = tracker.updates();
  report.counts["mises à jour"] = updates.length;
  report.counts["inchangées"] = [...docFor.values()].filter(
    (doc) => !tracker.changed(doc),
  ).length;
  return { inserts, updates, docs: [...docs, ...inserts], report };
}

// ─── Obtention ────────────────────────────────────────────────────────────────

/** Une ligne d'obtention telle que les imports l'ont toujours écrite : `- (Faction) Titre (Type)`. */
const GENERATED_LINE = /^- (\(.*?\) )?.+ \(.*\)$/;

function looksGenerated(text: string): boolean {
  return text.split("\n").every((line) => GENERATED_LINE.test(line));
}

/**
 * Réécrit le texte « Obtention » des blueprints à partir des missions qui les
 * font gagner — seulement là où ce texte vient d'un import. Un texte qu'un
 * administrateur a réécrit n'est plus celui que l'import avait laissé
 * (`generatedObtention`), et il est gardé.
 */
export function planObtention(
  blueprints: BlueprintDoc[],
  missions: MissionDoc[],
  factions: FactionDoc[],
): { updates: DocUpdate[]; report: Report } {
  const report = newReport();
  const tracker = new Tracker<BlueprintDoc>();
  const factionNames = new Map(
    factions.map((faction) => [faction._id.toHexString(), faction.name]),
  );

  const lines = new Map<string, Set<string>>();
  for (const mission of missions) {
    if (mission.removedInVersion) continue;
    const faction = mission.factionId
      ? factionNames.get(mission.factionId.toHexString())
      : undefined;
    const line = `- ${faction ? `(${faction}) ` : ""}${mission.title} (${mission.missionType || "?"})`;
    for (const id of mission.blueprints ?? []) {
      const key = id.toHexString();
      const set = lines.get(key) ?? new Set<string>();
      set.add(line);
      lines.set(key, set);
    }
  }

  for (const doc of blueprints) {
    if (!doc.gameId) continue;
    const generated = [...(lines.get(doc._id.toHexString()) ?? [])]
      .sort((a, b) => a.localeCompare(b))
      .join("\n");
    const current = doc.obtention ?? "";
    const fromImport =
      current === "" ||
      current === doc.generatedObtention ||
      (doc.generatedObtention === undefined && looksGenerated(current));
    if (!fromImport) {
      if (generated && current !== generated)
        note(report, "obtention saisie à la main, gardée", doc.name);
      continue;
    }
    tracker.change(doc, "obtention", generated);
    tracker.change(doc, "generatedObtention", generated || undefined);
  }

  const updates = tracker.updates();
  report.counts["textes d'obtention réécrits"] = updates.length;
  return { updates, report };
}
