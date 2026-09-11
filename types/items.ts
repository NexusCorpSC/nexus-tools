/**
 * Les objets du jeu : ce qui existe réellement en jeu (objets, armes,
 * véhicules), par opposition aux blueprints qui décrivent comment les
 * fabriquer. Un objet peut être fabricable à partir d'un ou plusieurs
 * blueprints, décliné en variantes (styles) et faire partie d'un ensemble.
 */

export const ITEM_KINDS = ["item", "weapon", "vehicle"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}

/** Turns any label into an url-safe, diacritic-free key. */
export function toItemSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      // Truncating last, then trimming, so a cut mid-separator cannot leave a
      // dangling hyphen behind.
      .slice(0, MAX_ITEM_NAME_LENGTH)
      .replace(/^-+|-+$/g, "")
  );
}

export type ItemStatistics = {
  [statName: string]: { value: string | number; unit?: string };
};

export type Item = {
  /** nanoid */
  id: string;
  /** Identifiant lisible utilisé dans les URLs. Unique. */
  slug: string;
  name: string;
  kind: ItemKind;
  description?: string;
  category: string;
  subcategory?: string;
  manufacturer?: string;
  /** Taille du composant (S0, S1…) pour les objets qui en ont une. */
  size?: number;
  tier?: number;
  imageUrl?: string;
  statistics?: ItemStatistics;
  /** Où obtenir cet objet en jeu. */
  obtention?: string;
  /**
   * Slugs des blueprints permettant de fabriquer cet objet. Laissé vide, les
   * blueprints portant exactement le même nom sont proposés à la place.
   */
  blueprintSlugs?: string[];
  /** Clé partagée par toutes les variantes (styles) d'un même objet. */
  variantGroup?: string;
  /** Nom de cette variante, ex. « Désert ». */
  variantName?: string;
  /** Clé de l'ensemble (set) auquel l'objet appartient. */
  setId?: string;
  /** Nom lisible de l'ensemble. */
  setName?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Ce qu'une carte de résultat ou une liste de variantes a besoin d'afficher. */
export type ItemSummary = Pick<
  Item,
  | "id"
  | "slug"
  | "name"
  | "kind"
  | "category"
  | "subcategory"
  | "manufacturer"
  | "imageUrl"
  | "tier"
  | "variantName"
  | "setName"
>;

/** Un blueprint tel qu'il est présenté depuis la fiche d'un objet. */
export type ItemBlueprintLink = {
  slug: string;
  name: string;
  category?: string;
  subcategory?: string;
  imageUrl?: string;
  tier?: number;
};

export type ItemDetails = Item & {
  /** Blueprints fabriquant cet objet, explicites ou déduits du nom. */
  blueprints: ItemBlueprintLink[];
  /** Les liens ci-dessus ont-ils été déduits du nom plutôt que déclarés ? */
  blueprintsInferred: boolean;
  /** Toutes les variantes du groupe, celle-ci comprise. Vide si aucune. */
  variants: ItemSummary[];
  /** Tous les objets de l'ensemble, celui-ci compris. Vide si aucun. */
  setItems: ItemSummary[];
};

export type ItemCategoryFacet = {
  category: string;
  subcategories: string[];
};

export type ItemGroupFacet = {
  id: string;
  name: string;
};

export type ItemFacets = {
  categories: ItemCategoryFacet[];
  manufacturers: string[];
  variantGroups: ItemGroupFacet[];
  sets: ItemGroupFacet[];
};

export type ItemListResponse = {
  items: ItemSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export const MAX_ITEM_NAME_LENGTH = 120;
export const MAX_ITEM_TEXT_LENGTH = 4000;
export const ITEM_PAGE_SIZE = 24;
export const MAX_ITEM_PAGE_SIZE = 100;

/** Permission gating every write on the catalogue of in-game objects. */
export const ITEMS_EDIT_PERMISSION = "items:edit";
