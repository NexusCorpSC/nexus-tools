/**
 * Les données du jeu telles que l'import les consomme, quelle que soit la
 * source qui les fournit. scmdb est la seule branchée aujourd'hui
 * (`scmdb.ts`) ; une autre — l'API du Star Citizen Wiki, qui partage les
 * mêmes GUID de blueprints — n'aurait qu'à rendre ce même `GameData`.
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
  subcategory?: string;
  /** GUID de l'entité fabriquée, celui que le wiki donne comme `uuid` d'objet. */
  productEntityClass?: string;
  craftingTime: number;
  recipe: BlueprintRecipe;
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
  category: string;
  missionType: string;
  title: string;
  description: string;
  factionGameId: string | null;
  canBeShared: boolean;
  illegal: boolean;
  rewardUEC?: number;
  /** GUID des blueprints que la mission peut faire gagner, sans doublon. */
  blueprintGameIds: string[];
};

export type GameData = {
  source: "scmdb";
  /** Version du jeu, par exemple `4.10.1-live.12660092`. */
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
