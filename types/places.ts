/**
 * Les lieux du 'verse : le catalogue des endroits où l'on se pose, par
 * opposition aux emplacements de stockage de l'inventaire, que chaque joueur
 * nomme comme il veut (collection `locations`, voir `types/inventory.ts`).
 *
 * Un lieu peut en contenir d'autres, et c'est la seule structure qui compte :
 * Stanton contient Hurston, qui contient Lorville, qui contient le Central
 * Business District, qui contient le centre médical. Un magasin est un lieu
 * comme un autre — Cubby Blast est contenu par la galerie où il se tient.
 *
 * Un lieu porte zéro, un ou plusieurs plans. Un plan est une image relevée
 * par la communauté, sur laquelle on pose des repères : soit un service, soit
 * un autre lieu — et ce repère-là ouvre le plan de ce lieu.
 */

export const PLACE_TYPES = [
  "star",
  "planet",
  "moon",
  "city",
  "station",
  "outpost",
  "spaceport",
  "district",
  "building",
  "shop",
] as const;

export type PlaceType = (typeof PLACE_TYPES)[number];

export function isPlaceType(value: string): value is PlaceType {
  return (PLACE_TYPES as readonly string[]).includes(value);
}

/**
 * Ce qu'on vient chercher sur place. Fermée à dessein : c'est une facette de
 * recherche, et les libellés vivent dans `messages/*.json` sous
 * `Places.services.<clé>` — jamais en base, sinon on retombe sur le texte
 * libre de `ResourceMarket.location`, qu'aucun filtre ne sait regrouper.
 */
export const PLACE_SERVICES = [
  "asop",
  "restock",
  "medical",
  "armory",
  "cargo",
  "refinery",
  "rental",
  "habitation",
  "crafting",
  "missions",
  "transit",
  "hangar",
] as const;

export type PlaceService = (typeof PLACE_SERVICES)[number];

export function isPlaceService(value: string): value is PlaceService {
  return (PLACE_SERVICES as readonly string[]).includes(value);
}

/** D'où vient une fiche importée. Saisie à la main : pas de provenance. */
export const PLACE_SOURCES = ["curated", "missions-json"] as const;

export type PlaceSourceName = (typeof PLACE_SOURCES)[number];

export type PlaceSource = {
  name: PlaceSourceName;
  id: string;
  importedAt?: string;
};

export const PLACE_SORTS = ["name", "children", "plans"] as const;

export type PlaceSort = (typeof PLACE_SORTS)[number];

export function isPlaceSort(value: string): value is PlaceSort {
  return (PLACE_SORTS as readonly string[]).includes(value);
}

export const MAX_PLACE_NAME_LENGTH = 120;
export const MAX_PLACE_TEXT_LENGTH = 4000;
export const PLACE_PAGE_SIZE = 24;
export const MAX_PLACE_PAGE_SIZE = 100;

/**
 * Stanton › Hurston › Lorville › CBD › centre médical, c'est déjà cinq. Huit
 * laisse de la marge sans qu'une boucle d'ancêtres puisse tourner longtemps.
 */
export const MAX_PLACE_DEPTH = 8;

export const MAX_PLACE_PLANS = 12;
export const MAX_PLACE_MARKERS = 120;

/** Au-delà, la vue arborescente demande d'affiner plutôt que de tout charger. */
export const MAX_PLACE_TREE_NODES = 600;

/** Turns any label into an url-safe, diacritic-free key. */
export function toPlaceSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      // Truncating last, then trimming, so a cut mid-separator cannot leave a
      // dangling hyphen behind.
      .slice(0, MAX_PLACE_NAME_LENGTH)
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Un repère posé sur un plan. Il porte soit un service, soit un autre lieu —
 * jamais les deux, jamais aucun des deux. Sa couleur n'est pas stockée : elle
 * se déduit du type du lieu visé, pour qu'un magasin devenu quartier change
 * d'allure partout sans qu'on ait à repasser sur les plans.
 */
export type PlacePlanMarker = {
  /** nanoid : la clé React, l'ancre `?pin=`, et l'identité pendant le glisser. */
  id: string;
  /** Fraction de l'image, origine en haut à gauche. Entre 0 et 1. */
  x: number;
  y: number;
  service?: PlaceService;
  /** Le slug du lieu que ce repère ouvre. */
  targetSlug?: string;
  label?: string;
  /** Une précision libre : « deuxième étage », « entrée nord ». */
  note?: string;
};

/**
 * Un plan. L'image est téléversée, jamais saisie : une URL externe casserait
 * `next/image`, dont les hôtes sont listés dans `next.config.ts`.
 */
export type PlacePlan = {
  id: string;
  name: string;
  note?: string;
  imageUrl: string;
  /**
   * Taille naturelle de l'image, lue au téléversement. Purement présentable :
   * elle donne le rapport d'aspect du cadre. Les repères, eux, sont en
   * fractions — une dimension fausse abîme la mise en page sans les déplacer.
   */
  imageWidth: number;
  imageHeight: number;
  markers: PlacePlanMarker[];
  /**
   * D'où vient ce plan quand il est emprunté. **Résolu à la lecture, jamais
   * stocké** : en base, le lieu emprunteur ne garde qu'un `PlacePlanRef`.
   * `normalizePlans` efface ce champ, pour qu'un aller-retour par l'éditeur ne
   * puisse pas figer une copie de ce qui doit rester une référence.
   */
  borrowedFrom?: PlacePlanOrigin;
};

export type PlacePlanOrigin = {
  slug: string;
  name: string;
  /** L'identifiant du plan chez la source, pas celui d'ici. */
  planId: string;
};

/**
 * Un plan emprunté à un autre lieu. Les Lazarus Complex et les Farro Data
 * Center sont bâtis sur le même moule : les relever dix fois coûterait dix
 * téléversements et dix séries de repères, et la onzième correction n'en
 * atteindrait qu'un seul.
 *
 * On ne recopie donc rien — on garde l'adresse. La source reste seule à
 * pouvoir modifier le plan, et sa correction se voit partout à la lecture
 * suivante. Un emprunt ne vise que des plans possédés : pas de chaîne, sinon
 * une source supprimée laisserait des maillons pendants qu'il faudrait suivre.
 */
export type PlacePlanRef = {
  id: string;
  sourceSlug: string;
  sourcePlanId: string;
};

/** Ce qu'un lieu range vraiment dans `plans` : un plan à lui, ou une adresse. */
export type StoredPlacePlan = PlacePlan | PlacePlanRef;

/**
 * La clé qui rapproche « Farro Data Center I » de « Farro Data Center X », et
 * « Lazarus Complex Phoenix-I » de « Lazarus Complex Phoenix-III ».
 *
 * On efface les désignations — chiffres, numéros romains, suffixes du genre
 * `-II` — et ce qui reste nomme le moule. Les numéros romains sont reconnus en
 * majuscules uniquement : sans cela « DID » ou « MIX » passeraient pour des
 * nombres, et deux lieux sans rapport se retrouveraient dans le même groupe.
 *
 * Phoenix et Tithonus restent séparés, à dessein : ce sont deux sites, et rien
 * ne dit qu'ils partagent un plan. L'écran de liaison ne fait de toute façon
 * que proposer — c'est un humain qui valide chaque rapprochement.
 */
export function placeGroupKey(name: string): string {
  return name
    .split(/\s+/)
    .map((token) => token.replace(/-(?:[IVXLCDM]+|\d+)$/, ""))
    .filter((token) => token && !/^(?:[IVXLCDM]+|\d+|[A-Z]-?\d+)$/.test(token))
    .join(" ")
    .trim();
}

/** En deçà, un « groupe » n'en est pas un : il n'y a rien à rapprocher. */
export const MIN_PLACE_GROUP_SIZE = 2;

/**
 * Un prédicat doit valider tout ce qu'il affirme : dire « c'est un
 * `PlacePlanRef` » sur la foi du seul `sourceSlug` laisserait passer un objet
 * incomplet, que la suite du code traiterait ensuite comme une référence
 * utilisable. Les trois champs sont donc vérifiés.
 */
export function isPlacePlanRef(plan: StoredPlacePlan): plan is PlacePlanRef {
  const ref = plan as PlacePlanRef;
  return (
    typeof ref.sourceSlug === "string" &&
    typeof ref.sourcePlanId === "string" &&
    typeof ref.id === "string"
  );
}

export type Place = {
  id: string;
  slug: string;
  name: string;
  type: PlaceType;
  description?: string;
  imageUrl?: string;
  services?: PlaceService[];
  /** Ce que vend un lieu de type `shop` : « armurerie », « vaisseaux »… */
  shopCategory?: string;

  /**
   * Le lieu qui contient celui-ci ; absent pour un système. C'est le seul
   * champ d'arborescence qu'un formulaire ou un import écrit.
   */
  parentSlug?: string;

  // ── Champs dérivés ────────────────────────────────────────────────────────
  // Recalculés par `recomputeSubtree()` dans `lib/places.ts`, et par rien
  // d'autre. Les écrire ailleurs, c'est se garantir un arbre faux le jour où
  // un lieu déménage.

  /** De la racine au parent direct : ["stanton", "hurston", "lorville"]. */
  ancestorSlugs: string[];
  depth: number;
  /**
   * « /stanton/hurston/lorville/ ». Trier dessus rend l'arbre déjà en ordre
   * de parcours, ce qui permet à la vue arborescente d'être une liste plate.
   */
  path: string;
  parentName?: string;
  systemSlug?: string;
  systemName?: string;
  bodySlug?: string;
  bodyName?: string;
  /** Enfants directs. */
  childCount: number;
  /** Lieux de type `shop` dans tout le sous-arbre. */
  shopCount: number;
  planCount: number;

  plans?: StoredPlacePlan[];
  source?: PlaceSource;
  createdAt?: string;
  updatedAt?: string;
};

/** Ce qu'une carte ou une ligne d'arbre affiche. Jamais les plans. */
export type PlaceSummary = Pick<
  Place,
  | "id"
  | "slug"
  | "name"
  | "type"
  | "imageUrl"
  | "services"
  | "shopCategory"
  | "parentSlug"
  | "parentName"
  | "depth"
  | "systemSlug"
  | "systemName"
  | "bodySlug"
  | "bodyName"
  | "childCount"
  | "shopCount"
  | "planCount"
>;

export type PlaceAncestor = Pick<Place, "slug" | "name" | "type">;

export type PlaceDetails = Place & {
  /**
   * Les plans prêts à afficher : les emprunts ont été remplacés par le plan de
   * leur source, et ceux dont la source a disparu ne sont plus là.
   */
  plans?: PlacePlan[];
  /** De la racine au parent direct, dans cet ordre. */
  ancestors: PlaceAncestor[];
  /** Les lieux contenus directement, dans l'ordre d'affichage. */
  children: PlaceSummary[];
  /** Les magasins de tout le sous-arbre : ceux de Lorville sont dans ses quartiers. */
  shops: PlaceSummary[];
  /**
   * Les lieux que les repères des plans ouvrent. Le visualiseur en tire le
   * nom, le type — qui décide de l'allure de la pastille — et de quoi savoir
   * si la descente mène quelque part.
   */
  planTargets: PlaceSummary[];
};

/** Le strict nécessaire pour afficher le plan d'un lieu voisin. */
export type PlacePlansResponse = {
  slug: string;
  name: string;
  type: PlaceType;
  ancestorSlugs: string[];
  ancestors: PlaceAncestor[];
  plans: PlacePlan[];
  /** Les lieux que les repères ouvrent, résolus une fois pour toutes. */
  targets: PlaceSummary[];
};

/** Un lieu tel que l'écran de liaison le montre : ce qu'il a, ce qu'il emprunte. */
export type PlaceGroupMember = {
  slug: string;
  name: string;
  type: PlaceType;
  systemName?: string;
  parentName?: string;
  /** Ses plans à lui, donc ceux qu'il peut prêter. */
  ownPlans: { id: string; name: string }[];
  /** Ce qu'il emprunte déjà, de quoi le détacher sans changer d'écran. */
  borrowed: {
    id: string;
    sourceSlug: string;
    sourceName?: string;
    sourcePlanId: string;
  }[];
};

export type PlaceGroup = {
  /** La clé de rapprochement, qui sert aussi de libellé au groupe. */
  key: string;
  members: PlaceGroupMember[];
};

export type PlaceGroupsResponse = { groups: PlaceGroup[] };

export type PlaceFacetCount = { value: string; count: number };

export type PlaceFacets = {
  types: PlaceFacetCount[];
  systems: { slug: string; name: string }[];
  bodies: { slug: string; name: string; systemSlug?: string }[];
  services: PlaceFacetCount[];
};

export type PlaceListResponse = {
  places: PlaceSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PlaceTreeNode = PlaceSummary & {
  /**
   * Faux quand le lieu n'est là que parce qu'un lieu qu'il contient répond au
   * filtre : la ligne s'affiche estompée, en contexte.
   */
  matched: boolean;
};

export type PlaceTreeResponse = {
  nodes: PlaceTreeNode[];
  /** Lieux correspondant au filtre, avant l'ajout des ancêtres de contexte. */
  total: number;
  truncated: boolean;
};

export const PLACES_EDIT_PERMISSION = "places:edit";
