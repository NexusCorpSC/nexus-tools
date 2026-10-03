/**
 * Les données du jeu telles que l'import les consomme, quelle que soit la
 * source qui les fournit : l'API du Star Citizen Wiki (`wiki.ts`, par
 * défaut) ou scmdb.net (`scmdb.ts`). Les deux partagent les GUID de
 * blueprints, qui viennent des fichiers du jeu.
 *
 * Une source ne sait pas tout : un champ `undefined` veut dire « inconnu de
 * la source », et l'import garde alors ce que la fiche en base en dit ; `null`
 * veut dire « la source dit qu'il n'y en a pas ».
 *
 * Les identifiants viennent du jeu, pas de la source : le GUID d'un
 * blueprint ne change pas d'un patch à l'autre alors que son nom, si
 * (27 renommages entre 4.8.1 et 4.10.1). C'est sur eux que l'import
 * rapproche ce qu'il reçoit de ce que la base contient déjà.
 */

import type { BlueprintRecipe } from "@/types/crafting";

export type GameBlueprint = {
  /** GUID de l'enregistrement du blueprint dans le jeu. */
  gameId: string;
  /** Nom technique (`BP_CRAFT_…`), stable et lisible : sert à départager deux homonymes. */
  tag: string;
  /** Nom affiché en jeu, absent pour quelques blueprints internes. */
  name: string | null;
  category: string;
  subcategory?: string | null;
  /** GUID de l'entité fabriquée, celui que le wiki donne comme `uuid` d'objet. */
  productEntityClass?: string;
  craftingTime: number;
  /**
   * La recette complète. Le wiki ne la donne qu'au détail de chaque
   * blueprint : elle n'est demandée que si `fingerprint` dit qu'elle a changé.
   */
  recipe?: BlueprintRecipe;
  /** Empreinte des ingrédients et du temps, comparable à une recette en base. */
  fingerprint: string;
};

export type GameFaction = {
  gameId: string;
  name: string;
};

export type GameMission = {
  /** Identifiant principal du contrat chez la source. */
  id: string;
  /**
   * Tous les identifiants de définition que la ligne regroupe. scmdb fusionne
   * les variantes d'une mission sous un identifiant « principal » qui peut
   * changer d'un patch à l'autre : c'est cet ensemble, avec `debugNames`, qui
   * permet de retrouver la mission déjà importée.
   */
  gameIds: string[];
  debugNames: string[];
  category?: string;
  missionType: string;
  title: string;
  description: string;
  factionGameId: string | null;
  /** Le nom du donneur de mission, pour retrouver sa faction quand la source n'en donne pas. */
  factionName?: string;
  canBeShared: boolean;
  illegal: boolean;
  rewardUEC?: number | null;
  /** GUID des blueprints que la mission peut faire gagner, sans doublon. */
  blueprintGameIds: string[];
};

export type GameData = {
  source: "wiki" | "scmdb";
  /** Version du jeu, par exemple `4.10.1-LIVE.12660092`. */
  version: string;
  blueprints: GameBlueprint[];
  factions: GameFaction[];
  missions: GameMission[];
  /** Ce que la source a fourni mais que l'import n'a pas pu lire, pour le rapport. */
  warnings: string[];
};

/**
 * Le slug historique des blueprints. Il doit rester identique à celui des
 * premiers imports : c'est en le recalculant qu'on sait si un administrateur
 * a choisi lui-même le slug d'une fiche.
 */
export function toBlueprintSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\W_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Les textes de mission arrivent avec les balises de mise en valeur du jeu
 * (`<EM4>…</EM4>`) et des retours à la ligne échappés (`\n` littéral), que la
 * page afficherait tels quels.
 */
export function cleanGameText(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/<\/?EM\d*>/g, "")
    .trim();
}

/**
 * Un titre que le jeu remplit au moment d'afficher la mission
 * (`[Contractor|BountyTitle]`, `[Title]`) ou jamais renseigné
 * (`<= UNINITIALIZED =>`). scmdb les résout, pas le wiki : un tel titre ne
 * remplace pas celui d'une mission en base, et n'en crée pas de nouvelle.
 */
export function isPlaceholderTitle(title: string): boolean {
  return (
    title.trim() === "" ||
    /^\[[^\]]*\]$/.test(title.trim()) ||
    /\[[A-Za-z]+\|[^\]]*Title[^\]]*\]/.test(title) ||
    /<=.*=>/.test(title)
  );
}

/**
 * L'empreinte d'une recette : ce qui distingue deux blueprints homonymes
 * (quatre refroidisseurs s'appellent « Cryo-Star SL »). Sert à retrouver,
 * parmi eux, celui dont une fiche importée avant les GUID porte la recette.
 */
export function recipeSignature(recipe: BlueprintRecipe | undefined): string {
  if (!recipe) return "";
  return JSON.stringify([
    recipe.craftingTime ?? 0,
    (recipe.components ?? []).map((component) => [
      component.name,
      (component.options ?? []).map((option) => [
        option.name,
        option.quantity,
        option.minQuality ?? null,
      ]),
    ]),
  ]);
}

/**
 * L'empreinte des ingrédients d'une recette : chaque ingrédient avec sa
 * quantité totale, plus le temps de fabrication. La liste des blueprints du
 * wiki n'a que cela (les emplacements et qualités minimales sont au détail) ;
 * deux empreintes égales disent que la recette en base est toujours la bonne.
 */
export function ingredientsFingerprint(
  craftingTime: number,
  ingredients: { name: string; quantity: number }[],
): string {
  const totals = new Map<string, number>();
  for (const { name, quantity } of ingredients) {
    totals.set(name, (totals.get(name) ?? 0) + quantity);
  }
  return JSON.stringify([
    craftingTime,
    [...totals]
      .map(([name, quantity]) => [name, Math.round(quantity * 10_000) / 10_000])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  ]);
}

export function recipeFingerprint(recipe: BlueprintRecipe | undefined): string {
  if (!recipe) return "";
  return ingredientsFingerprint(
    recipe.craftingTime ?? 0,
    (recipe.components ?? []).flatMap((component) =>
      (component.options ?? []).map((option) => ({
        name: option.name,
        quantity: option.quantity,
      })),
    ),
  );
}

// ─── Lecture d'une source ─────────────────────────────────────────────────────

/** Une source qui ne répond pas comme prévu : l'import s'arrête sans rien écrire. */
export class SourceFormatError extends Error {}

export const USER_AGENT =
  "nexus-tools-import/0.1 (+https://tools.services.nexus)";

export const isString = (value: unknown): value is string =>
  typeof value === "string";
export const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isStringOrNull = (value: unknown) =>
  value === null || isString(value);
export const isStringList = (value: unknown) =>
  Array.isArray(value) && value.every(isString);

/**
 * Au-delà de cette part d'enregistrements illisibles, ce n'est plus une
 * poignée de lignes abîmées mais un format qui a changé : l'import s'arrête.
 */
const MAX_INVALID_RATIO = 0.02;

/**
 * Garde les enregistrements lisibles, et s'arrête si trop ne le sont pas.
 * Les problèmes sont comptés par champ : « 1 400 contrats sans `title` » dit
 * tout de suite que la source a renommé le champ.
 */
export function keepValid<T>(
  source: string,
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
  if (invalid === 0 && rows.length > 0) return kept;

  const detail = [...byField]
    .map(([field, count]) => `${field} (${count})`)
    .join(", ");
  if (rows.length === 0 || invalid / rows.length > MAX_INVALID_RATIO) {
    throw new SourceFormatError(
      rows.length === 0
        ? `${label} : la source n'en donne aucun. Le format de ${source} a probablement changé ; rien n'a été écrit.`
        : `${label} : ${invalid} enregistrement(s) sur ${rows.length} n'ont pas la forme attendue — ${detail}. Le format de ${source} a probablement changé ; rien n'a été écrit.`,
    );
  }
  warnings.push(
    `${label} : ${invalid} enregistrement(s) ignoré(s) — ${detail}`,
  );
  return kept;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Un GET qui insiste poliment sur 429/5xx et sur les coupures réseau, et qui
 * refuse une réponse qui n'est pas du JSON (scmdb répond par sa page HTML
 * pour une version qu'il ne sert plus). `notJson` explique ce cas.
 */
export async function fetchJson(
  url: string,
  notJson: string,
  attempts = 4,
): Promise<unknown> {
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
            `${url} a répondu « ${type || "sans type"} » au lieu de JSON : ${notJson}`,
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
    // Un 429 demande d'attendre plus qu'une coupure.
    await sleep(2000 * attempt * (failure.startsWith("429") ? 3 : 1));
  }
}
