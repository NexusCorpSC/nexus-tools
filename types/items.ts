/**
 * Les objets du jeu : ce qui existe réellement en jeu (objets, armes,
 * véhicules, ressources), par opposition aux blueprints qui décrivent comment
 * les fabriquer. Un objet peut être fabricable à partir d'un ou plusieurs
 * blueprints, décliné en variantes (styles) et faire partie d'un ensemble.
 *
 * Chaque type d'objet a sa propre fiche, et donc ses propres données : un
 * véhicule porte des points d'emport et des composants, une arme un profil de
 * dégâts, une ressource des cours et un rendement de raffinage. Ces blocs sont
 * tous optionnels — une fiche non renseignée s'affiche avec ses encarts
 * « à compléter » plutôt qu'avec des sections vides.
 */

export const ITEM_KINDS = ["item", "weapon", "vehicle", "resource"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}

export const MAX_ITEM_NAME_LENGTH = 120;
export const MAX_ITEM_TEXT_LENGTH = 4000;
export const ITEM_PAGE_SIZE = 24;
export const MAX_ITEM_PAGE_SIZE = 100;

/** Nombre maximum de lignes dans une liste saisie à la main (slots, cours…). */
export const MAX_ITEM_ROWS = 40;

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

/**
 * Mongo stores a nested `undefined` as `null`, and an old document may predate
 * a field entirely, so a number read back from the database is only a number
 * once this says so.
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type ItemStatistics = {
  [statName: string]: { value: string | number; unit?: string };
};

/**
 * Un emplacement recevant un autre objet : point d'emport d'un véhicule,
 * composant monté, accessoire d'une arme. `itemSlug` pointe vers la fiche de
 * l'objet monté quand il est au catalogue ; sinon `itemName` porte son nom.
 */
export type ItemSlot = {
  /** Libellé de l'emplacement, ex. « Tourelle télécommandée ». */
  label: string;
  /** Taille de l'emplacement : 2 pour S2. */
  size?: number;
  /** Slug de l'objet monté, s'il est au catalogue. */
  itemSlug?: string;
  /** Nom de l'objet monté quand il n'a pas encore de fiche. */
  itemName?: string;
  /** Nombre d'exemplaires montés (2 × Répéteur). */
  quantity?: number;
  /** Précision libre : grade, effet, état. */
  note?: string;
};

/** Un emplacement dont l'objet monté a été résolu vers sa fiche. */
export type ResolvedItemSlot = ItemSlot & {
  /** Renseigné quand `itemSlug` correspond à un objet existant. */
  mounted?: ItemSummary;
};

export type VehicleDetails = {
  /** Nombre de places. */
  crew?: number;
  /** Vitesse maximale, en m/s. */
  speedMax?: number;
  /** Vitesse de croisière (SCM), en m/s. */
  speedScm?: number;
  /** Capacité de soute, en SCU. */
  cargoScu?: number;
  /** Masse à vide, en kg. */
  mass?: number;
  /** Dimensions hors tout, en mètres. */
  length?: number;
  width?: number;
  height?: number;
  /** Points d'emport (armement). */
  hardpoints?: ItemSlot[];
  /** Composants montés (générateur, bouclier, refroidisseur…). */
  components?: ItemSlot[];
};

/** Une caractéristique de tir comparable aux autres armes de la même classe. */
export type WeaponStat = {
  label: string;
  value: number;
  unit?: string;
};

export type WeaponDetails = {
  /** Type de dégâts : ballistique, laser, distortion… */
  damageType?: string;
  /** Calibre ou munition, ex. « 7,2 × 51 mm ». */
  caliber?: string;
  /** Profil de tir, affiché en barres comparées à la classe. */
  profile?: WeaponStat[];
  /** Cadence de tir, en coups par minute. */
  rateOfFire?: number;
  /** Capacité du chargeur. */
  magazine?: number;
  /** Temps de rechargement, en secondes. */
  reloadTime?: number;
  /** Masse, en kg. */
  mass?: number;
  /** Accessoires montés ou disponibles. */
  attachments?: ItemSlot[];
};

export const RESOURCE_MARKET_SIDES = ["buy", "sell", "grey"] as const;
export type ResourceMarketSide = (typeof RESOURCE_MARKET_SIDES)[number];

export type ResourceMarket = {
  /** Comptoir, station ou raffinerie. */
  location: string;
  /** Sens du cours : le comptoir achète, vend, ou marché gris. */
  side: ResourceMarketSide;
  /** Prix unitaire en aUEC. */
  price: number;
  /** Stock disponible ; absent = illimité. */
  stock?: number;
};

export const EXTRACTION_FREQUENCIES = [
  "common",
  "occasional",
  "risky",
] as const;
export type ExtractionFrequency = (typeof EXTRACTION_FREQUENCIES)[number];

export type ResourceExtraction = {
  location: string;
  /** Méthode : minage laser S2, prospection ROC, récupération… */
  method?: string;
  frequency?: ExtractionFrequency;
};

export type ResourceRefining = {
  /** Procédé de raffinage. */
  process?: string;
  /** Rendement, en pourcentage. */
  yield?: number;
  /** Durée du cycle, en secondes. */
  durationSeconds?: number;
  /** Coût du cycle, en aUEC. */
  cost?: number;
  /** Nom du produit raffiné. */
  outputName?: string;
};

export type ResourceDetails = {
  /** Forme brute : minerai, gaz, composant récupéré… */
  form?: string;
  /** Cargaison instable, à signaler au transport. */
  volatile?: boolean;
  /** Volume d'une unité, en SCU. */
  unitVolumeScu?: number;
  /** Pureté relevée, en pourcentage. */
  purityMin?: number;
  purityMax?: number;
  /** Cours relevés par comptoir. */
  markets?: ResourceMarket[];
  /** Derniers cours moyens, du plus ancien au plus récent. */
  priceHistory?: number[];
  refining?: ResourceRefining;
  extraction?: ResourceExtraction[];
  /** Contrainte de transport, affichée en encart. */
  transportNote?: string;
  /** Moment où les cours ont été confirmés pour la dernière fois. */
  pricesUpdatedAt?: string;
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
  /** Données propres aux véhicules. Absent = fiche à compléter. */
  vehicle?: VehicleDetails;
  /** Données propres aux armes. Absent = fiche à compléter. */
  weapon?: WeaponDetails;
  /** Données propres aux ressources. Absent = fiche à compléter. */
  resource?: ResourceDetails;
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
  /** Quantité consommée, quand le blueprint utilise l'objet comme matériau. */
  quantity?: number;
};

/**
 * Une caractéristique de tir remise à l'échelle de sa classe : le maximum sert
 * de plein pour la barre, la moyenne de repère. Les deux sont calculés sur les
 * armes de la même catégorie plutôt que stockés, pour ne jamais être périmés.
 */
export type WeaponStatScale = WeaponStat & {
  max: number;
  average?: number;
  /**
   * False when no other weapon of the class carries this statistic: there is
   * nothing to scale against, so the fiche shows the figure without a bar
   * rather than a bar that reads as a full score.
   */
  comparable: boolean;
};

/** Une arme de la même classe, pour le comparatif de la fiche. */
export type WeaponPeer = {
  slug: string;
  name: string;
  value: number;
  isCurrent: boolean;
};

export type ItemDetails = Item & {
  /** Blueprints fabriquant cet objet, explicites ou déduits du nom. */
  blueprints: ItemBlueprintLink[];
  /** Les liens ci-dessus ont-ils été déduits du nom plutôt que déclarés ? */
  blueprintsInferred: boolean;
  /** Blueprints consommant cet objet comme matériau. */
  consumedBy: ItemBlueprintLink[];
  /** Toutes les variantes du groupe, celle-ci comprise. Vide si aucune. */
  variants: ItemSummary[];
  /** Tous les objets de l'ensemble, celui-ci compris. Vide si aucun. */
  setItems: ItemSummary[];
  /** Points d'emport et composants avec l'objet monté résolu. */
  hardpoints: ResolvedItemSlot[];
  components: ResolvedItemSlot[];
  attachments: ResolvedItemSlot[];
  /** Profil de tir remis à l'échelle de la classe. */
  weaponProfile: WeaponStatScale[];
  /** Comparatif de classe sur la première caractéristique du profil. */
  weaponPeers: WeaponPeer[];
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

/** Permission gating every write on the catalogue of in-game objects. */
export const ITEMS_EDIT_PERMISSION = "items:edit";
