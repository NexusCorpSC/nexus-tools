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

/**
 * Les plans du véhicule : les vues orthographiques et le modèle 3D. Ce sont
 * les rendus dont Fleetyards fait ses fleetcharts, pas des visuels de
 * communication — une vue de dessus y est vraiment prise de dessus, à
 * l'échelle, sur fond transparent.
 */
export type VehiclePlans = {
  /** Vue de dessus. */
  top?: string;
  /** Vue de côté. */
  side?: string;
  /** Vue de face. */
  front?: string;
  /** Modèle 3D au format glTF, maillage compressé en Draco. */
  holo?: string;
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
  /** Plans du véhicule : vues orthographiques et modèle 3D. */
  plans?: VehiclePlans;
};

/** Une caractéristique de tir comparable aux autres armes de la même classe. */
export type WeaponStat = {
  label: string;
  value: number;
  unit?: string;
};

/** Un mode de tir : automatique, semi-automatique, rafale, charge… */
export type WeaponFireMode = {
  /** Libellé tel que le jeu l'affiche : AUTO, SEMI, BURST, CHARGE. */
  label: string;
  /** Cadence dans ce mode, en coups par minute. */
  rpm?: number;
  /** DPS soutenu dans ce mode. */
  dps?: number;
  ammoPerShot?: number;
  /** Projectiles par tir : 12 pour un fusil à pompe. */
  pelletsPerShot?: number;
  /** Tirs par rafale, pour un mode rafale. */
  burstCount?: number;
  heatPerShot?: number;
};

/**
 * Dispersion du tir, en degrés : le cône s'ouvre d'un cran au premier tir
 * puis à chaque tir, entre un minimum et un maximum, et se referme à la
 * vitesse `decay` quand on cesse le feu.
 */
export type WeaponSpread = {
  min?: number;
  max?: number;
  firstShot?: number;
  perShot?: number;
  /** Degrés par seconde. */
  decay?: number;
};

export type WeaponAmmunition = {
  /** Taille de munition (S1, S2…). */
  size?: number;
  /** Vitesse du projectile, en m/s. */
  speed?: number;
  /** Portée maximale du projectile, en mètres. */
  range?: number;
  /** Durée de vol, en secondes. */
  lifetime?: number;
  capacity?: number;
  /** Type de dégâts du projectile : physique, énergie, distorsion… */
  damageType?: string;
  /** Dégâts d'un projectile à bout portant. */
  damagePerShot?: number;
  /** Distance à partir de laquelle les dégâts chutent, en mètres. */
  falloffStart?: number;
  /** Dégâts perdus par mètre au-delà. */
  falloffPerMeter?: number;
  /** Plancher sous lequel les dégâts ne descendent plus. */
  falloffMinDamage?: number;
  /** Épaisseur maximale traversée. */
  penetration?: number;
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
  fireModes?: WeaponFireMode[];
  /** Dispersion au tir à la hanche. */
  spread?: WeaponSpread;
  /** Dispersion en visée. */
  adsSpread?: WeaponSpread;
  ammunition?: WeaponAmmunition;
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

export const ITEM_SOURCES = ["rsi", "scwiki", "uex", "fleetyards"] as const;
export type ItemSourceName = (typeof ITEM_SOURCES)[number];

/**
 * D'où vient un objet importé. Le couple `name` + `id` est la clé qu'un
 * ré-import retrouve pour mettre à jour la fiche au lieu d'en créer une
 * deuxième ; un objet saisi à la main n'en a pas.
 */
export type ItemSource = {
  name: ItemSourceName;
  /** Identifiant de l'objet chez la source (id RSI, uuid du wiki, id UEX). */
  id: string;
  /** Page de l'objet chez la source, quand elle existe. */
  url?: string;
  importedAt?: string;
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
  source?: ItemSource;
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
  /** Objets (véhicules, armes) qui embarquent celui-ci dans un emplacement. */
  mountedOn: ItemSummary[];
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

/**
 * Comparaison de plusieurs objets d'un même type, colonne par colonne.
 *
 * Une comparaison porte toujours sur un seul `ItemKind` : les lignes viennent
 * du type comparé (un vaisseau apporte sa soute et ses emports, une arme son
 * profil de tir), et mélanger les types ne donnerait qu'un tableau de trous.
 */

/** Nombre maximum de colonnes : au-delà, la lecture se perd. */
export const MAX_COMPARE_ITEMS = 5;

/** Sens de lecture d'une ligne : 1 = plus c'est haut, mieux c'est. */
export type ComparisonDirection = 1 | -1;

/** `null` = la fiche ne renseigne pas cette caractéristique. */
export type ComparisonValue = string | number | null;

export type ComparisonRow = {
  key: string;
  /** Clé de traduction sous `Items.Compare.rows`, pour les champs connus. */
  labelKey?: string;
  /** Libellé déjà lisible : nom d'une statistique saisie à la main. */
  label?: string;
  /** Symbole affiché après la valeur (m/s, SCU, kg…). */
  unit?: string;
  /** Absent quand aucune valeur n'est « meilleure » : une longueur, un type. */
  direction?: ComparisonDirection;
  /** Comment l'écart à la colonne de référence se lit. */
  delta?: "pct" | "abs";
  /** Une barre de proportion a-t-elle un sens sur cette ligne ? */
  bar?: boolean;
  /** Les valeurs sont des clés de traduction sous `Items.Compare.values`. */
  translateValues?: boolean;
  /** Une valeur par objet comparé, dans l'ordre de `ItemComparison.items`. */
  values: ComparisonValue[];
};

export type ComparisonGroup = {
  /** Clé de traduction sous `Items.Compare.groups`. */
  key: string;
  rows: ComparisonRow[];
};

export type ItemComparison = {
  /** Les objets comparés, dans l'ordre des colonnes. */
  items: ItemSummary[];
  /** Le type sur lequel la comparaison est verrouillée. */
  kind: ItemKind;
  /** Catégorie du premier objet : ce que le sélecteur propose en priorité. */
  category: string;
  subcategory?: string;
  groups: ComparisonGroup[];
  /** Slugs demandés qui n'ont aucune fiche. */
  missing: string[];
  /** Objets écartés faute d'être du même type que le premier. */
  rejected: ItemSummary[];
};

/**
 * Lit le paramètre `?ids=` d'une comparaison : des slugs séparés par des
 * virgules, dédoublonnés et plafonnés. Un lien bricolé à la main ne doit ni
 * faire échouer la page, ni ouvrir quarante colonnes.
 */
export function parseCompareIds(value: string | null | undefined): string[] {
  if (!value) return [];

  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const slug = toItemSlug(part.trim());
    if (slug) seen.add(slug);
    if (seen.size >= MAX_COMPARE_ITEMS) break;
  }

  return [...seen];
}

/** Permission gating every write on the catalogue of in-game objects. */
export const ITEMS_EDIT_PERMISSION = "items:edit";
