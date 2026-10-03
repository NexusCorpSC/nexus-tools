/**
 * L'API du Star Citizen Wiki (api.star-citizen.wiki) comme source des
 * blueprints, des factions et des missions. C'est la source par défaut.
 *
 * L'API est documentée (`/api/openapi`) et versionnée par version du jeu
 * (`?version=4.10.1-LIVE.12660092`). Pour limiter les requêtes, tout passe
 * par les listes, à 200 lignes par page (le maximum) :
 *   - `/api/blueprints`, environ 9 pages ;
 *   - `/api/missions`, les missions regroupées comme en jeu, environ 9 pages ;
 *   - `/api/missions?filter[grouped]=false`, chaque variante, environ 26
 *     pages : elles seules donnent les noms techniques de toutes les variantes,
 *     qui retrouvent les missions déjà en base ;
 *   - `/api/factions`, une page.
 * Une cinquantaine de requêtes pour tout le catalogue, au lieu d'une par fiche.
 *
 * Ce que les listes n'ont pas :
 *   - la recette complète d'un blueprint (emplacements, qualité minimale)
 *     n'est qu'au détail. La liste donne les ingrédients, assez pour savoir
 *     si la recette en base est toujours la bonne (`fingerprint`) : le
 *     détail n'est demandé que pour les blueprints nouveaux ou modifiés ;
 *   - le montant de la récompense manque pour beaucoup de missions : une
 *     mission déjà en base garde alors le sien ;
 *   - le type de mission du jeu (Mercenary, Delivery…) n'est qu'au détail :
 *     la liste n'a que la famille de la mission (Security, Hauling…), qui
 *     sert de type ;
 *   - la sous-catégorie des blueprints : une fiche garde la sienne.
 */

import type { BlueprintRecipe } from "@/types/crafting";
import {
  cleanGameText,
  fetchJson as fetchSourceJson,
  ingredientsFingerprint,
  isNumber,
  isObject,
  isString,
  isStringOrNull,
  keepValid as keepValidFrom,
  SourceFormatError,
  type GameBlueprint,
  type GameData,
  type GameMission,
} from "./source";

const WIKI_API = "https://api.star-citizen.wiki/api";
const PAGE_SIZE = 200;
/** Des pages lues en parallèle, sans charger un service tenu par des bénévoles. */
const CONCURRENCY = 4;

// ─── Forme brute des réponses ─────────────────────────────────────────────────

type RawIngredient = {
  name: string;
  kind: string;
  quantity_scu: number | null;
  quantity: number | null;
};

type RawBlueprint = {
  uuid: string;
  key: string;
  output_item_uuid: string | null;
  output_name: string | null;
  craft_time_seconds: number;
  ingredients: RawIngredient[];
  output: { type: string | null } | null;
};

type RawMission = {
  uuid: string;
  title: string;
  description: string | null;
  debug_name: string | null;
  mission_giver: string | null;
  faction: { uuid: string; name: string } | null;
  illegal: boolean | null;
  shareable: boolean | null;
  reward_min: number | null;
  reward_max: number | null;
  reward_scope: string | null;
  released: boolean;
  not_for_release: boolean | null;
  variants?: { uuid: string }[] | null;
  blueprints?: { link: string }[] | null;
};

type RawFaction = { uuid: string; name: string };

type RawRequirement = {
  kind: string;
  name?: string;
  quantity_scu?: number | null;
  quantity?: number | null;
  min_quality?: number | null;
  children?: RawRequirement[];
};

// ─── Vérification de forme ────────────────────────────────────────────────────

function blueprintProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isString(raw.uuid)) return "uuid";
  if (!isString(raw.key)) return "key";
  if (!isStringOrNull(raw.output_name ?? null)) return "output_name";
  if (!isStringOrNull(raw.output_item_uuid ?? null)) return "output_item_uuid";
  if (!isNumber(raw.craft_time_seconds)) return "craft_time_seconds";
  if (raw.output != null && !isObject(raw.output)) return "output";
  if (!Array.isArray(raw.ingredients)) return "ingredients";
  for (const ingredient of raw.ingredients) {
    if (!isObject(ingredient) || !isString(ingredient.name))
      return "ingredients[].name";
    if (!isNumber(ingredient.quantity_scu) && !isNumber(ingredient.quantity))
      return "ingredients[].quantity";
  }
  return null;
}

function missionProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isString(raw.uuid)) return "uuid";
  if (!isString(raw.title)) return "title";
  if (!isStringOrNull(raw.debug_name ?? null)) return "debug_name";
  if (!isStringOrNull(raw.description ?? null)) return "description";
  if (!isStringOrNull(raw.mission_giver ?? null)) return "mission_giver";
  if (!isStringOrNull(raw.reward_scope ?? null)) return "reward_scope";
  if (
    raw.faction != null &&
    (!isObject(raw.faction) ||
      !isString(raw.faction.uuid) ||
      !isString(raw.faction.name))
  )
    return "faction";
  if (typeof raw.released !== "boolean") return "released";
  if (raw.reward_min != null && !isNumber(raw.reward_min)) return "reward_min";
  if (raw.reward_max != null && !isNumber(raw.reward_max)) return "reward_max";
  if (
    raw.variants != null &&
    (!Array.isArray(raw.variants) ||
      !raw.variants.every(
        (variant) => isObject(variant) && isString(variant.uuid),
      ))
  )
    return "variants";
  if (
    raw.blueprints != null &&
    (!Array.isArray(raw.blueprints) ||
      !raw.blueprints.every(
        (reward) => isObject(reward) && isString(reward.link),
      ))
  )
    return "blueprints";
  return null;
}

function factionProblem(raw: unknown): string | null {
  if (!isObject(raw)) return "pas un objet";
  if (!isString(raw.uuid)) return "uuid";
  if (!isString(raw.name)) return "name";
  return null;
}

function keepValid<T>(
  label: string,
  rows: unknown[],
  problem: (raw: unknown) => string | null,
  warnings: string[],
): T[] {
  return keepValidFrom<T>("l'API du wiki", label, rows, problem, warnings);
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * La catégorie des fiches, dans le vocabulaire des premiers imports (celui de
 * scmdb) que les filtres du site connaissent. Un type inconnu passe tel quel,
 * en minuscules, et le rapport le signale.
 */
const CATEGORIES: [RegExp, string][] = [
  [/^Weapon(Gun|Personal)$/, "weapons"],
  [/^WeaponAttachment$/, "ammo"],
  [/^WeaponMining$/, "mininglaser"],
  [/^Char_(Armor|Clothing)_/, "armour"],
  [/^Container$/, "orepod"],
  [/^(Misc|Cargo)$/, "missionitems"],
  [/^Cooler$/, "cooler"],
  [/^(TractorBeam|SalvageHead)$/, "tractorbeam"],
  [/^MiningModifier$/, "miningmodule"],
  [/^SalvageModifier$/, "salvage"],
  [/^DockingCollar$/, "refuelling"],
  [/^PowerPlant$/, "powerplant"],
  [/^QuantumDrive$/, "quantumdrive"],
  [/^Radar$/, "radar"],
  [/^Shield$/, "shield"],
];

function toCategory(type: string | null, unknown: Set<string>): string {
  if (!type) return "other";
  const found = CATEGORIES.find(([pattern]) => pattern.test(type));
  if (found) return found[1];
  unknown.add(type);
  return type.toLowerCase();
}

function toBlueprint(
  raw: RawBlueprint,
  unknownTypes: Set<string>,
): GameBlueprint {
  return {
    gameId: raw.uuid,
    tag: raw.key,
    name: raw.output_name?.trim() || null,
    category: toCategory(raw.output?.type ?? null, unknownTypes),
    productEntityClass: raw.output_item_uuid ?? undefined,
    craftingTime: raw.craft_time_seconds,
    fingerprint: ingredientsFingerprint(
      raw.craft_time_seconds,
      raw.ingredients.map((ingredient) => ({
        name: ingredient.name,
        quantity: (ingredient.quantity_scu ?? ingredient.quantity)!,
      })),
    ),
  };
}

/** Le GUID du blueprint au bout du lien `…/api/blueprints/<guid>`. */
const BLUEPRINT_LINK = /\/blueprints\/([0-9a-f-]{36})(?:$|[?#/])/i;

function toMission(
  raw: RawMission,
  variantNames: Map<string, string>,
  unreadLinks: Set<string>,
): GameMission {
  const variants = (raw.variants ?? []).map((variant) => variant.uuid);
  const debugNames = new Set(raw.debug_name ? [raw.debug_name] : []);
  for (const uuid of variants) {
    const name = variantNames.get(uuid);
    if (name) debugNames.add(name);
  }

  const blueprintGameIds = new Set<string>();
  for (const reward of raw.blueprints ?? []) {
    const gameId = reward.link.match(BLUEPRINT_LINK)?.[1];
    if (gameId) blueprintGameIds.add(gameId.toLowerCase());
    else unreadLinks.add(reward.link);
  }

  // `reward_max` vaut 0 quand la récompense est fixe ; les deux à 0 veulent
  // dire que le wiki n'a pas le montant, pas que la mission ne paie rien.
  const reward = Math.max(raw.reward_min ?? 0, raw.reward_max ?? 0);

  return {
    id: raw.uuid,
    gameIds: [...new Set([raw.uuid, ...variants])],
    debugNames: [...debugNames],
    // La catégorie du jeu (career, story, event) n'est pas au wiki.
    category: undefined,
    // Le type du jeu n'est qu'au détail ; la liste a la famille de la mission
    // (Security, Hauling…), qui en tient lieu.
    missionType: raw.reward_scope ?? "",
    title: cleanGameText(raw.title),
    description: cleanGameText(raw.description ?? ""),
    factionGameId: raw.faction?.uuid ?? null,
    factionName:
      (raw.faction?.name ?? raw.mission_giver ?? "").trim() || undefined,
    canBeShared: raw.shareable ?? false,
    illegal: raw.illegal ?? false,
    rewardUEC: reward > 0 ? reward : undefined,
    blueprintGameIds: [...blueprintGameIds],
  };
}

// ─── Téléchargement ───────────────────────────────────────────────────────────

function fetchJson(url: string): Promise<unknown> {
  return fetchSourceJson(url, "l'API du wiki a peut-être changé d'adresse.");
}

/** Lance `tasks` avec au plus `limit` en cours à la fois, dans l'ordre. */
async function pool<T>(
  tasks: (() => Promise<T>)[],
  limit = CONCURRENCY,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
  return results;
}

export type WikiStats = { requests: number };

function url(endpoint: string, params: Record<string, string>): string {
  return `${WIKI_API}/${endpoint}?${new URLSearchParams(params)}`;
}

type Page = { data: unknown[]; lastPage: number };

function readPage(raw: unknown, address: string): Page {
  if (
    !isObject(raw) ||
    !Array.isArray(raw.data) ||
    !isObject(raw.meta) ||
    !isNumber(raw.meta.last_page)
  ) {
    throw new SourceFormatError(
      `${address} : réponse sans \`data\` ou sans \`meta.last_page\`. Le format de l'API du wiki a probablement changé ; rien n'a été écrit.`,
    );
  }
  return { data: raw.data, lastPage: raw.meta.last_page };
}

/** Toutes les lignes d'une liste : la première page dit combien il y en a. */
async function list(
  endpoint: string,
  params: Record<string, string>,
  stats: WikiStats,
): Promise<unknown[]> {
  const pageUrl = (page: number) =>
    url(endpoint, {
      ...params,
      "page[size]": String(PAGE_SIZE),
      "page[number]": String(page),
    });
  stats.requests += 1;
  const first = readPage(await fetchJson(pageUrl(1)), pageUrl(1));
  const rest = await pool(
    Array.from({ length: first.lastPage - 1 }, (_, i) => async () => {
      stats.requests += 1;
      return readPage(await fetchJson(pageUrl(i + 2)), pageUrl(i + 2)).data;
    }),
  );
  return [...first.data, ...rest.flat()];
}

/**
 * La version à importer : celle demandée (sans tenir compte de la casse :
 * scmdb écrit `live`, le wiki `LIVE`), sinon celle que le wiki sert par
 * défaut, le dernier LIVE qu'il a extrait.
 */
export async function resolveWikiVersion(
  requested: string | undefined,
  stats: WikiStats,
): Promise<string> {
  const versions = (await list("game-versions", {}, stats)).filter(
    (entry): entry is { code: string; is_default?: boolean } =>
      isObject(entry) && isString(entry.code),
  );
  const version = requested
    ? versions.find(
        (entry) => entry.code.toLowerCase() === requested.toLowerCase(),
      )
    : versions.find((entry) => entry.is_default === true);
  if (!version) {
    throw new SourceFormatError(
      requested
        ? `Le wiki ne connaît pas la version ${requested} (${versions.map((entry) => entry.code).join(", ")}).`
        : `Le wiki n'a pas de version par défaut (${WIKI_API}/game-versions).`,
    );
  }
  return version.code;
}

/** Ce qu'il faut lire : les listes de missions coûtent les trois quarts des requêtes. */
export type WikiParts = { blueprints: boolean; missions: boolean };

/** Les blueprints, les factions et les missions d'une version, par les listes. */
export async function loadWiki(
  version: string,
  parts: WikiParts,
  stats: WikiStats,
): Promise<GameData> {
  const params = { version };
  const warnings: string[] = [];
  const data: GameData = {
    source: "wiki",
    version,
    blueprints: [],
    factions: [],
    missions: [],
    warnings,
  };

  // L'une après l'autre : chacune lit déjà ses pages en parallèle.
  if (parts.blueprints) {
    const unknownTypes = new Set<string>();
    data.blueprints = keepValid<RawBlueprint>(
      "Blueprints",
      await list("blueprints", params, stats),
      blueprintProblem,
      warnings,
    ).map((raw) => toBlueprint(raw, unknownTypes));
    if (unknownTypes.size > 0) {
      warnings.push(
        `Types d'objet sans catégorie connue, gardés tels quels : ${[...unknownTypes].join(", ")}`,
      );
    }
  }

  if (parts.missions) {
    const missionRows = await list("missions", params, stats);
    const variantRows = await list(
      "missions",
      { ...params, "filter[grouped]": "false" },
      stats,
    );
    const factionRows = await list("factions", params, stats);

    const variantNames = new Map<string, string>();
    for (const raw of keepValid<RawMission>(
      "Variantes de missions",
      variantRows,
      missionProblem,
      warnings,
    )) {
      if (raw.debug_name) variantNames.set(raw.uuid, raw.debug_name);
    }

    const unreadLinks = new Set<string>();
    data.missions = keepValid<RawMission>(
      "Missions",
      missionRows,
      missionProblem,
      warnings,
    )
      .filter((raw) => raw.released && !raw.not_for_release)
      .map((raw) => toMission(raw, variantNames, unreadLinks));
    if (unreadLinks.size > 0) {
      warnings.push(
        `${unreadLinks.size} lien(s) de blueprint récompensé illisible(s), par ex. ${[...unreadLinks][0]}`,
      );
    }

    data.factions = keepValid<RawFaction>(
      "Factions",
      factionRows,
      factionProblem,
      warnings,
    ).map((raw) => ({ gameId: raw.uuid, name: raw.name.trim() }));
  }

  return data;
}

// ─── Recettes ─────────────────────────────────────────────────────────────────

function leaves(node: RawRequirement): RawRequirement[] {
  if (node.kind === "group" || node.kind === "root")
    return (node.children ?? []).flatMap(leaves);
  return [node];
}

/** La recette d'un blueprint, depuis son détail : un emplacement par groupe. */
function toRecipe(raw: unknown): BlueprintRecipe | null {
  if (!isObject(raw) || !isObject(raw.data)) return null;
  const { data } = raw;
  const tiers = data.tiers;
  if (!Array.isArray(tiers) || !isObject(tiers[0])) return null;
  const tier = tiers[0];
  const requirements = tier.requirements as RawRequirement | undefined;
  const craftingTime = isNumber(tier.craft_time_seconds)
    ? tier.craft_time_seconds
    : data.craft_time_seconds;
  if (!isObject(requirements) || !Array.isArray(requirements.children))
    return null;
  if (!isNumber(craftingTime)) return null;

  const components: BlueprintRecipe["components"] = [];
  for (const group of requirements.children) {
    if (!isObject(group) || !isString(group.name)) return null;
    const options = [];
    for (const leaf of leaves(group)) {
      const quantity = leaf.quantity_scu ?? leaf.quantity;
      if (!isString(leaf.name) || !isNumber(quantity)) return null;
      options.push({
        quantity,
        minQuality: isNumber(leaf.min_quality) ? leaf.min_quality : undefined,
        unit: leaf.kind === "resource" ? "SCU" : "unit",
        name: leaf.name,
      });
    }
    components.push({ name: group.name, options });
  }
  return { craftingTime, components };
}

/**
 * Le détail des blueprints demandés, pour leur recette complète. Un détail
 * illisible laisse la fiche sans nouvelle recette (elle garde l'ancienne) et
 * l'import le signale ; trop d'échecs l'arrêtent.
 */
export async function loadWikiRecipes(
  version: string,
  gameIds: string[],
  stats: WikiStats,
  warnings: string[],
): Promise<Map<string, BlueprintRecipe>> {
  const recipes = new Map<string, BlueprintRecipe>();
  const failed: string[] = [];
  await pool(
    gameIds.map((gameId) => async () => {
      stats.requests += 1;
      try {
        const recipe = toRecipe(
          await fetchJson(url(`blueprints/${gameId}`, { version })),
        );
        if (recipe) recipes.set(gameId, recipe);
        else failed.push(gameId);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        failed.push(gameId);
      }
    }),
  );
  if (failed.length > 0) {
    if (failed.length > Math.max(5, gameIds.length * 0.02)) {
      throw new SourceFormatError(
        `Recettes : ${failed.length} détail(s) de blueprint sur ${gameIds.length} illisible(s) (par ex. ${failed[0]}). Le format de l'API du wiki a probablement changé ; rien n'a été écrit.`,
      );
    }
    warnings.push(
      `Recettes : ${failed.length} détail(s) illisible(s), ces fiches gardent leur recette : ${failed.join(", ")}`,
    );
  }
  return recipes;
}
