/**
 * Le lore du 'Verse depuis l'API du Star Citizen Wiki : les articles de la
 * Galactapedia et la starmap de RSI (systèmes et objets célestes).
 *
 * Trois listes, à 200 lignes par page, une quinzaine de requêtes en tout :
 *   - `/api/galactapedia`, environ 1 500 articles : la liste donne déjà le
 *     texte complet, le détail n'est jamais demandé ;
 *   - `/api/starsystems?include=jumppoints`, une page ;
 *   - `/api/celestial-objects`, environ 900 objets.
 * Rien de tout cela ne dépend de la version du jeu.
 *
 * Seul l'anglais est gardé : les autres « traductions » de la source sont des
 * copies de l'anglais, parfois le texte d'un autre article.
 *
 * Un article est suivi par son identifiant RSI, un objet de la starmap par
 * son code : jamais par le nom. Ce qui disparaît de la source est marqué
 * `removedAt`, pas supprimé.
 *
 * Les rapprochements avec le catalogue sont faits ici, une fois pour toutes :
 *   - un système ou un corps de la starmap retrouve son lieu par son nom (ou
 *     sa désignation) parmi les lieux de son système, comme le fait
 *     `import:celestial-bodies` ; un lieu déjà rattaché le reste tant qu'il
 *     existe ;
 *   - et son article de la Galactapedia par le titre, quand un seul article
 *     du bon modèle porte ce nom.
 */

import type { ObjectId } from "mongodb";
import type {
  LoreArticle,
  StarmapEntry,
  StarmapJumpPoint,
  StarmapSensor,
} from "@/types/lore";
import {
  guardRemovals,
  newReport,
  note,
  sameValue,
  type DocUpdate,
  type Report,
} from "./plan";
import {
  isNumber,
  isObject,
  isString,
  isStringOrNull,
  keepValid,
} from "./source";
import { list, type WikiStats } from "./wiki";

const SOURCE = "l'API du Star Citizen Wiki";

// ─── Forme brute des réponses ─────────────────────────────────────────────────

type Named = { name: string | null };
type Translations = Record<string, string | null> | null;

type RawArticle = {
  id: string;
  title: string;
  slug: string;
  thumbnail: string | null;
  type: string | null;
  template: string | null;
  rsi_url: string;
  categories: Named[] | null;
  tags: Named[] | null;
  translations: Translations;
  created_at: string | null;
};

type RawSensor = { population: number; economy: number; danger: number };

type RawSystem = {
  id: number;
  code: string;
  name: string;
  status: string | null;
  type: string;
  description: Translations;
  aggregated: RawSensor | null;
  affiliation: Named[] | null;
  jumppoints?: {
    size: string | null;
    exit: { system_id: number; code: string } | null;
  }[];
};

type RawObject = {
  id: number;
  code: string;
  system_id: number;
  name: string | null;
  designation: string | null;
  type: string;
  habitable: boolean | null;
  description: Translations;
  sensor: RawSensor | null;
  parent_id: number | null;
  affiliation: Named[] | null;
  sub_type: Named | null;
};

function articleProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isString(raw.id)) return "id";
  if (!isString(raw.title)) return "title";
  if (!isString(raw.slug)) return "slug";
  if (!isString(raw.rsi_url)) return "rsi_url";
  if (!isObject(raw.translations)) return "translations";
  if (!isStringOrNull(raw.translations.en_EN ?? null))
    return "translations.en_EN";
  if (raw.categories != null && !Array.isArray(raw.categories))
    return "categories";
  if (raw.tags != null && !Array.isArray(raw.tags)) return "tags";
  return null;
}

function systemProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isNumber(raw.id)) return "id";
  if (!isString(raw.code)) return "code";
  if (!isString(raw.name)) return "name";
  if (!isString(raw.type)) return "type";
  if (raw.jumppoints != null && !Array.isArray(raw.jumppoints))
    return "jumppoints";
  return null;
}

function objectProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isNumber(raw.id)) return "id";
  if (!isString(raw.code)) return "code";
  if (!isNumber(raw.system_id)) return "system_id";
  if (!isString(raw.type)) return "type";
  if (!isStringOrNull(raw.name ?? null)) return "name";
  if (!isStringOrNull(raw.designation ?? null)) return "designation";
  return null;
}

// ─── Mise en forme ────────────────────────────────────────────────────────────

const english = (translations: Translations): string | undefined => {
  const text = translations?.en_EN?.trim();
  return text ? text : undefined;
};

const names = (list: Named[] | null | undefined): string[] =>
  (list ?? [])
    .map((entry) => entry?.name?.trim())
    .filter((name): name is string => !!name);

const sensor = (raw: RawSensor | null): StarmapSensor | undefined =>
  raw &&
  isNumber(raw.population) &&
  isNumber(raw.economy) &&
  isNumber(raw.danger)
    ? { population: raw.population, economy: raw.economy, danger: raw.danger }
    : undefined;

/** Les articles cités par un texte, par leur identifiant RSI. */
export function linkedArticleIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(
    /galactapedia\/article\/([A-Za-z0-9]{10})(?=[-)/?#]|$)/g,
  ))
    ids.add(match[1]);
  return [...ids];
}

/** Ce que la source dit d'un article ; les champs de suivi viennent après. */
type ArticleRecord = Omit<LoreArticle, "importedAt" | "removedAt">;

function toArticle(raw: RawArticle): ArticleRecord | null {
  const body = english(raw.translations);
  // « Pending review by the Ark research team... » : pas encore d'article.
  if (!body || /^pending review by the ark/i.test(body)) return null;
  const linked = linkedArticleIds(body).filter((id) => id !== raw.id);
  return {
    wikiId: raw.id,
    slug: raw.slug,
    title: raw.title.trim(),
    template: raw.template ?? undefined,
    type: raw.type ?? undefined,
    categories: names(raw.categories),
    tags: names(raw.tags),
    thumbnailUrl: raw.thumbnail ?? undefined,
    body,
    rsiUrl: new URL(raw.rsi_url, "https://robertsspaceindustries.com").href,
    linkedIds: linked,
    createdAt: raw.created_at ?? undefined,
  };
}

type StarmapRecord = Omit<
  StarmapEntry,
  "placeSlug" | "articleId" | "importedAt" | "removedAt"
>;

function toSystem(
  raw: RawSystem,
  codes: Map<number, RawSystem>,
): StarmapRecord {
  const jumpPoints: StarmapJumpPoint[] = [];
  for (const jump of raw.jumppoints ?? []) {
    const target = jump.exit ? codes.get(jump.exit.system_id) : undefined;
    if (!target || target.code === raw.code) continue;
    if (jumpPoints.some((known) => known.to === target.code)) continue;
    jumpPoints.push({
      to: target.code,
      toName: target.name,
      size: jump.size ?? undefined,
    });
  }
  return {
    code: raw.code,
    kind: "system",
    systemCode: raw.code,
    name: raw.name.trim(),
    type: raw.type,
    status: raw.status ?? undefined,
    description: english(raw.description),
    affiliations: names(raw.affiliation),
    sensor: sensor(raw.aggregated),
    jumpPoints,
  };
}

function toBody(
  raw: RawObject,
  systems: Map<number, RawSystem>,
  objects: Map<number, RawObject>,
): StarmapRecord | null {
  const system = systems.get(raw.system_id);
  const name = (raw.name ?? raw.designation ?? "").trim();
  if (!system || !name) return null;
  const description = english(raw.description);
  const designation = raw.designation?.trim();
  return {
    code: raw.code,
    kind: "body",
    systemCode: system.code,
    name,
    designation: designation && designation !== name ? designation : undefined,
    type: raw.type,
    subType: raw.sub_type?.name ?? undefined,
    // Les points de saut ont tous « Jump Point » pour description.
    description: description === "Jump Point" ? undefined : description,
    affiliations: names(raw.affiliation),
    sensor: sensor(raw.sensor),
    habitable: raw.habitable ?? undefined,
    parentCode:
      raw.parent_id != null ? objects.get(raw.parent_id)?.code : undefined,
  };
}

// ─── Chargement ───────────────────────────────────────────────────────────────

export type WikiLore = {
  articles: ArticleRecord[];
  starmap: StarmapRecord[];
  warnings: string[];
};

export async function loadWikiLore(stats: WikiStats): Promise<WikiLore> {
  const warnings: string[] = [];
  const [rawArticles, rawSystems, rawObjects] = await Promise.all([
    list("galactapedia", {}, stats),
    list("starsystems", { include: "jumppoints" }, stats),
    list("celestial-objects", {}, stats),
  ]);

  const articleRows = keepValid<RawArticle>(
    SOURCE,
    "Galactapedia",
    rawArticles,
    articleProblem,
    warnings,
  );
  const articles: ArticleRecord[] = [];
  let pending = 0;
  const seen = new Set<string>();
  for (const raw of articleRows) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    const article = toArticle(raw);
    if (article) articles.push(article);
    else pending++;
  }
  if (pending > 0)
    warnings.push(`Galactapedia : ${pending} article(s) sans texte, ignoré(s)`);

  const systemRows = keepValid<RawSystem>(
    SOURCE,
    "Systèmes de la starmap",
    rawSystems,
    systemProblem,
    warnings,
  );
  const objectRows = keepValid<RawObject>(
    SOURCE,
    "Objets de la starmap",
    rawObjects,
    objectProblem,
    warnings,
  );
  const systems = new Map(systemRows.map((raw) => [raw.id, raw]));
  const objects = new Map(objectRows.map((raw) => [raw.id, raw]));
  const starmap: StarmapRecord[] = systemRows.map((raw) =>
    toSystem(raw, systems),
  );
  let orphans = 0;
  for (const raw of objectRows) {
    const body = toBody(raw, systems, objects);
    if (body) starmap.push(body);
    else orphans++;
  }
  if (orphans > 0)
    warnings.push(
      `Starmap : ${orphans} objet(s) sans nom ou hors des systèmes connus, ignoré(s)`,
    );

  return { articles, starmap, warnings };
}

// ─── Rapprochements ───────────────────────────────────────────────────────────

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10 };

function fromRoman(word: string): number | null {
  if (!/^[ivx]+$/.test(word)) return null;
  let total = 0;
  for (let index = 0; index < word.length; index++) {
    const value = ROMAN[word[index]];
    const next = ROMAN[word[index + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

/** « Pyro V », « pyro 5 » et « Pyro5 » donnent tous « pyro5 ». */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => fromRoman(word)?.toString() ?? word)
    .join("");
}

/** « Vanguard System (VS-02) » → la clé de « Vanguard ». */
const systemTitleKey = (title: string) =>
  nameKey(title.replace(/\(.*\)/g, "").replace(/\bsystem\b/i, ""));

/** Une clé → les valeurs qui la portent ; seules les clés uniques servent. */
function uniqueIndex<T>(entries: [string, T][]): Map<string, T> {
  const all = new Map<string, T[]>();
  for (const [key, value] of entries) {
    if (!key) continue;
    all.set(key, [...(all.get(key) ?? []), value]);
  }
  return new Map(
    [...all]
      .filter(([, values]) => values.length === 1)
      .map(([k, v]) => [k, v[0]]),
  );
}

/** Ce qu'il faut savoir d'un lieu du catalogue pour le rapprocher. */
export type PlaceRef = {
  slug: string;
  name: string;
  type: string;
  parentSlug?: string;
  systemSlug?: string;
};

/** Les types de lieux qu'un type d'objet de la starmap peut désigner. */
const PLACE_TYPES_FOR: Record<string, string[]> = {
  PLANET: ["planet"],
  SATELLITE: ["moon"],
  MANMADE: ["station"],
};

function linkPlaces(
  records: StarmapRecord[],
  existing: Map<string, StarmapEntry>,
  places: PlaceRef[],
  report: Report,
): Map<string, string> {
  const links = new Map<string, string>();
  const known = new Set(places.map((place) => place.slug));
  const roots = uniqueIndex(
    places
      .filter((place) => !place.parentSlug)
      .map((place) => [nameKey(place.name), place.slug]),
  );

  // Les systèmes d'abord : leurs corps se cherchent parmi leurs lieux.
  const systemPlaces = new Map<string, string>();
  for (const record of records) {
    if (record.kind !== "system") continue;
    const kept = existing.get(record.code)?.placeSlug;
    const slug =
      kept && known.has(kept) ? kept : roots.get(nameKey(record.name));
    if (slug) {
      links.set(record.code, slug);
      systemPlaces.set(record.code, slug);
    }
  }

  const bySystem = new Map<string, Map<string, string>>();
  for (const [systemCode, systemSlug] of systemPlaces) {
    const inside = places.filter((place) => place.systemSlug === systemSlug);
    const byType = new Map<string, [string, string][]>();
    for (const place of inside)
      byType.set(place.type, [
        ...(byType.get(place.type) ?? []),
        [nameKey(place.name), place.slug],
      ]);
    for (const [type, entries] of byType)
      bySystem.set(`${systemCode}/${type}`, uniqueIndex(entries));
  }

  for (const record of records) {
    if (record.kind !== "body") continue;
    const kept = existing.get(record.code)?.placeSlug;
    if (kept && known.has(kept)) {
      links.set(record.code, kept);
      continue;
    }
    const types = PLACE_TYPES_FOR[record.type];
    if (!types || !systemPlaces.has(record.systemCode)) continue;
    const keys = [record.name, record.designation]
      .filter((value): value is string => !!value)
      .map(nameKey);
    for (const type of types) {
      const index = bySystem.get(`${record.systemCode}/${type}`);
      const slug = keys.map((key) => index?.get(key)).find(Boolean);
      if (slug) {
        links.set(record.code, slug);
        break;
      }
    }
    if (!links.has(record.code) && record.description)
      note(report, "corps décrits sans lieu au catalogue", record.code);
  }
  return links;
}

/**
 * Les clés d'un titre de la Galactapedia : « Crusader (Stanton II) » se
 * retrouve par « Crusader », par « Stanton II » et par les deux ensemble.
 */
function titleKeys(title: string): string[] {
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(title);
  if (!match) return [nameKey(title)];
  return [nameKey(title), nameKey(match[1]), nameKey(match[2])];
}

function linkArticles(
  records: StarmapRecord[],
  articles: ArticleRecord[],
): Map<string, string> {
  const systems = uniqueIndex(
    articles
      .filter((article) => article.template === "StarSystem")
      .map((article) => [systemTitleKey(article.title), article.wikiId]),
  );
  const bodies = uniqueIndex(
    articles
      .filter(
        (article) => article.template === "PlanetMoonSpaceStationPlatform",
      )
      .flatMap((article) =>
        // Une clé répétée dans un même titre ne doit pas le rendre ambigu.
        [...new Set(titleKeys(article.title))].map((key): [string, string] => [
          key,
          article.wikiId,
        ]),
      ),
  );
  const links = new Map<string, string>();
  for (const record of records) {
    const keys =
      record.kind === "system"
        ? [nameKey(record.name)]
        : [
            record.designation
              ? nameKey(`${record.name} ${record.designation}`)
              : "",
            nameKey(record.name),
            record.designation ? nameKey(record.designation) : "",
          ].filter(Boolean);
    const index = record.kind === "system" ? systems : bodies;
    const id = keys.map((key) => index.get(key)).find(Boolean);
    if (id) links.set(record.code, id);
  }
  return links;
}

// ─── Plan d'écriture ──────────────────────────────────────────────────────────

type Stored<T> = T & { _id: ObjectId };

export type LoreChanges<T> = {
  inserts: T[];
  updates: DocUpdate[];
};

export type LorePlan = {
  articles: LoreChanges<LoreArticle>;
  starmap: LoreChanges<StarmapEntry>;
  reports: { articles: Report; starmap: Report };
};

/** Les champs qui changent entre un document en base et sa nouvelle version. */
function diff(
  stored: Record<string, unknown>,
  next: Record<string, unknown>,
  keys: string[],
): { set: Record<string, unknown>; unset: string[] } {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const key of keys) {
    if (sameValue(stored[key], next[key])) continue;
    if (next[key] === undefined) unset.push(key);
    else set[key] = next[key];
  }
  return { set, unset };
}

function planCollection<T extends { importedAt: string; removedAt?: string }>(
  label: string,
  stored: Stored<T>[],
  records: (Omit<T, "importedAt" | "removedAt"> & Record<string, unknown>)[],
  keyOf: (doc: Record<string, unknown>) => string,
  fields: string[],
  options: { now: string; allowMassRemoval: boolean },
  report: Report,
): LoreChanges<T> {
  const byKey = new Map(stored.map((doc) => [keyOf(doc), doc]));
  const inserts: T[] = [];
  const updates: DocUpdate[] = [];
  const present = new Set<string>();

  for (const record of records) {
    const key = keyOf(record);
    present.add(key);
    const doc = byKey.get(key);
    if (!doc) {
      inserts.push(
        Object.fromEntries(
          Object.entries({ ...record, importedAt: options.now }).filter(
            ([, value]) => value !== undefined,
          ),
        ) as T,
      );
      note(report, "nouveaux");
      continue;
    }
    const { set, unset } = diff(doc as Record<string, unknown>, record, fields);
    const back = doc.removedAt !== undefined;
    if (Object.keys(set).length === 0 && unset.length === 0 && !back) continue;
    if (back) {
      unset.push("removedAt");
      note(report, "revenus", key);
    } else note(report, "modifiés", key);
    updates.push({
      _id: doc._id,
      set: { ...set, importedAt: options.now },
      unset,
    });
  }

  const active = stored.filter((doc) => doc.removedAt === undefined);
  const gone = active.filter((doc) => !present.has(keyOf(doc)));
  if (!options.allowMassRemoval)
    guardRemovals(label, gone.length, active.length);
  for (const doc of gone) {
    updates.push({ _id: doc._id, set: { removedAt: options.now }, unset: [] });
    note(report, "disparus de la source", keyOf(doc));
  }
  return { inserts, updates };
}

const ARTICLE_FIELDS: (keyof ArticleRecord)[] = [
  "slug",
  "title",
  "template",
  "type",
  "categories",
  "tags",
  "thumbnailUrl",
  "body",
  "rsiUrl",
  "linkedIds",
  "createdAt",
];

const STARMAP_FIELDS: (keyof StarmapEntry)[] = [
  "kind",
  "systemCode",
  "name",
  "designation",
  "type",
  "subType",
  "status",
  "description",
  "affiliations",
  "sensor",
  "habitable",
  "parentCode",
  "jumpPoints",
  "placeSlug",
  "articleId",
];

export function planLore(
  lore: WikiLore,
  stored: {
    articles: Stored<LoreArticle>[];
    starmap: Stored<StarmapEntry>[];
  },
  places: PlaceRef[],
  options: { allowMassRemoval: boolean; now?: string },
): LorePlan {
  const now = options.now ?? new Date().toISOString();
  const reports = { articles: newReport(), starmap: newReport() };

  const existing = new Map(stored.starmap.map((doc) => [doc.code, doc]));
  const placeLinks = linkPlaces(
    lore.starmap,
    existing,
    places,
    reports.starmap,
  );
  const articleLinks = linkArticles(lore.starmap, lore.articles);
  const starmap = lore.starmap.map((record) => ({
    ...record,
    placeSlug: placeLinks.get(record.code),
    articleId: articleLinks.get(record.code),
  }));
  reports.starmap.counts["rattachés à un lieu"] = placeLinks.size;
  reports.starmap.counts["rattachés à un article"] = articleLinks.size;

  return {
    articles: planCollection<LoreArticle>(
      "Galactapedia",
      stored.articles,
      lore.articles,
      (doc) => doc.wikiId as string,
      ARTICLE_FIELDS,
      { now, allowMassRemoval: options.allowMassRemoval },
      reports.articles,
    ),
    starmap: planCollection<StarmapEntry>(
      "Starmap",
      stored.starmap,
      starmap,
      (doc) => doc.code as string,
      STARMAP_FIELDS,
      { now, allowMassRemoval: options.allowMassRemoval },
      reports.starmap,
    ),
    reports,
  };
}
