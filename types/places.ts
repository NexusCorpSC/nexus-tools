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

import type { PlanGlyph } from "@/lib/plan-symbols";

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

/**
 * Huit niveaux : au-delà, ce n'est plus un lieu qu'on relève mais une ville, et
 * la planche exportée ne les tient plus côte à côte de toute façon.
 */
export const MAX_PLAN_LEVELS = 8;

/**
 * Deux cents pièces par niveau. Le plus dense des lieux relevés à la main en
 * compte une quarantaine ; cinq fois la marge suffit, et tout le plan tient
 * dans le document du lieu, qu'un `$size` relit à chaque recalcul d'arbre.
 */
export const MAX_LEVEL_ROOMS = 200;

/** Les murs isolés sont l'exception : ils bordent ce que les pièces ne bordent pas. */
export const MAX_LEVEL_WALLS = 400;
export const MAX_LEVEL_DOORS = 200;
export const MAX_LEVEL_LABELS = 100;

/**
 * Les cotes d'un niveau. Une planche qui en porte plus de cinquante ne se lit
 * plus : ce sont des chiffres par-dessus un dessin, et ils finissent par cacher
 * ce qu'ils mesurent.
 */
export const MAX_LEVEL_MEASURES = 50;

/**
 * Les sommets d'une pièce libre. Au-delà de quarante, on ne relève plus un
 * bâtiment, on décalque une courbe — et le rendu comme la saisie deviennent
 * illisibles bien avant.
 */
export const MAX_ROOM_POINTS = 40;

/**
 * Cinq kilomètres de côté, en centimètres. Une borne de sûreté, pas une
 * ambition : elle empêche une saisie aberrante de produire une planche que le
 * rendu ne saura jamais rastériser.
 */
export const MAX_PLAN_EXTENT_CM = 500_000;

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
 * Un repère posé sur un plan. Il porte **une seule** de trois choses : un
 * service, un autre lieu, ou un symbole.
 *
 * Le symbole est le cas neuf. Un service est ce qu'on vient chercher sur place
 * et un lieu est une porte vers ailleurs — mais une caisse à fouiller, une
 * caméra, une clé de sécurité ne sont ni l'un ni l'autre, et un relevé qui ne
 * sait pas les montrer oblige à détourner un service pour dire autre chose que
 * ce qu'il dit.
 *
 * Sa couleur n'est pas stockée : elle se déduit du type du lieu visé, pour
 * qu'un magasin devenu quartier change d'allure partout sans qu'on ait à
 * repasser sur les plans.
 */
export type PlacePlanMarker = {
  /** nanoid : la clé React, l'ancre `?pin=`, et l'identité pendant le glisser. */
  id: string;
  /** Fraction de l'image, origine en haut à gauche. Entre 0 et 1. */
  x: number;
  y: number;
  /**
   * Le niveau sur lequel il est posé, pour un plan dessiné. Absent sur un plan
   * image, qui n'a qu'une feuille : c'est ce qui permet à un repère d'exister
   * au premier étage sans se montrer au rez-de-chaussée.
   */
  levelId?: string;
  service?: PlaceService;
  /** Le slug du lieu que ce repère ouvre. */
  targetSlug?: string;
  /** Le dessin d'un repère qui ne désigne ni un service ni un lieu. */
  glyph?: PlanGlyph;
  label?: string;
  /** Une précision libre : « deuxième étage », « entrée nord ». */
  note?: string;
};

/**
 * Un plan, et ses deux natures.
 *
 * Un plan **image** est un relevé venu d'ailleurs : une capture redressée, une
 * carte trouvée sur le wiki. C'est ce qui existait en premier, et l'image est
 * téléversée, jamais saisie — une URL externe casserait `next/image`, dont les
 * hôtes sont listés dans `next.config.ts`.
 *
 * Un plan **dessiné** est un relevé fait ici, pièce par pièce. Il existe parce
 * que beaucoup de lieux n'ont aucune carte : ni en jeu, ni sur le wiki, nulle
 * part. Sans lui, ces lieux-là restent sans plan pour toujours, puisque le seul
 * moyen d'en avoir un était d'en trouver un.
 *
 * Ce qui ne change pas d'une nature à l'autre est ce qui compte : **les repères
 * restent des fractions de l'emprise**. Le visualiseur, l'emprunt entre lieux et
 * le prêt d'un relevé à un plan de vol ignorent donc si le fond est une image ou
 * une géométrie, et n'ont pas à l'apprendre.
 */
export const PLAN_KINDS = ["image", "drawn"] as const;

export type PlanKind = (typeof PLAN_KINDS)[number];

/** Ce qu'un plan porte quelle que soit sa nature. */
type PlacePlanBase = {
  id: string;
  name: string;
  note?: string;
  markers: PlacePlanMarker[];
  /**
   * D'où vient ce plan quand il est emprunté. **Résolu à la lecture, jamais
   * stocké** : en base, le lieu emprunteur ne garde qu'un `PlacePlanRef`.
   * `normalizePlans` efface ce champ, pour qu'un aller-retour par l'éditeur ne
   * puisse pas figer une copie de ce qui doit rester une référence.
   */
  borrowedFrom?: PlacePlanOrigin;
};

/**
 * Le relevé téléversé.
 *
 * `kind` est facultatif, et c'est délibéré : les documents écrits avant les
 * plans dessinés ne le portent pas, et un plan sans nature est une image. Rien
 * à migrer, aucun script à passer.
 */
export type ImagePlacePlan = PlacePlanBase & {
  kind?: "image";
  imageUrl: string;
  /**
   * Taille naturelle de l'image, lue au téléversement. Purement présentable :
   * elle donne le rapport d'aspect du cadre. Les repères, eux, sont en
   * fractions — une dimension fausse abîme la mise en page sans les déplacer.
   */
  imageWidth: number;
  imageHeight: number;
};

/**
 * L'aperçu rastérisé d'un plan dessiné, produit à l'enregistrement.
 *
 * Il n'est pas la source de vérité — la géométrie l'est — mais il est ce que
 * lisent tous ceux qui ne savent pas dessiner un plan : l'overlay de
 * `nexus-app` et le fond d'un plan de vol. Facultatif à dessein : si le rendu
 * échoue au moment d'enregistrer, on perd l'aperçu, jamais le relevé.
 */
export type PlanPreview = { url: string; width: number; height: number };

/**
 * La capture qui a servi au relevé, posée sous le dessin.
 *
 * C'est un outil, pas le plan : elle ne part **jamais** au rendu, et
 * `lib/plan-render.ts` ne la connaît pas. Une capture d'écran de jeu dans une
 * planche publiée serait au mieux illisible, au pire un problème de droits.
 *
 * Elle est persistée quand même — sans cela, il faudrait la recaler à chaque
 * ouverture, et un relevé se fait en plusieurs séances.
 */
export type PlanUnderlay = {
  url: string;
  /** Taille naturelle de l'image, pour lui garder ses proportions. */
  width: number;
  height: number;
  /** Son calage sur l'emprise, en centimètres, et son échelle. */
  x: number;
  y: number;
  scale: number;
  /** Entre 0 et 1. Au-delà de la moitié, le dessin ne se voit plus dessus. */
  opacity: number;
};

export type DrawnPlacePlan = PlacePlanBase & {
  kind: "drawn";
  /**
   * L'emprise du relevé, en centimètres entiers.
   *
   * Des centimètres et pas des pixels, pour la raison que `PLAN_GRID` donne
   * dans `types/plan.ts` : un plan dessiné sur un grand écran et relu sur un
   * téléphone est le même plan. Et la largeur d'un couloir est une longueur,
   * pas une décision d'affichage — c'est ce qui permet de coter le relevé.
   */
  widthCm: number;
  heightCm: number;
  levels: PlanLevel[];
  preview?: PlanPreview;
  underlay?: PlanUnderlay;
};

export type PlacePlan = ImagePlacePlan | DrawnPlacePlan;

/**
 * Un prédicat doit valider tout ce qu'il affirme, comme `isPlacePlanRef` :
 * annoncer un plan dessiné sur le seul `kind` laisserait passer un document
 * tronqué, que le rendu traiterait ensuite comme une géométrie utilisable.
 */
export function isDrawnPlan(plan: PlacePlan): plan is DrawnPlacePlan {
  return (
    plan.kind === "drawn" &&
    Array.isArray(plan.levels) &&
    // L'emprise est ce que le rendu met dans son `viewBox` : nulle ou absente,
    // elle ne produit pas un plan de travers mais un SVG que rien n'affiche.
    Number.isFinite(plan.widthCm) &&
    plan.widthCm > 0 &&
    Number.isFinite(plan.heightCm) &&
    plan.heightCm > 0
  );
}

/**
 * L'image d'un plan, quelle que soit sa nature — ou rien, quand un plan dessiné
 * n'a pas encore été rendu. Les quelques écrans qui montrent un plan sans savoir
 * le dessiner passent tous par là, plutôt que de lire `imageUrl` en aveugle.
 */
export function planImage(plan: PlacePlan): PlanPreview | null {
  if (isDrawnPlan(plan)) return plan.preview ?? null;
  return plan.imageUrl
    ? { url: plan.imageUrl, width: plan.imageWidth, height: plan.imageHeight }
    : null;
}

/* ------------------------------------------------------------------ */
/* La géométrie d'un plan dessiné                                      */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'une pièce est, au sens du rendu : sa nature décide de son remplissage
 * par défaut et de la ligne que la légende lui consacre. Fermée comme
 * `PLACE_SERVICES`, et pour la même raison — c'est une facette, pas du texte
 * libre, et les libellés vivent dans `messages/*.json`.
 */
export const ROOM_KINDS = [
  "technical",
  "storage",
  "living",
  "medical",
  "circulation",
  "outside",
] as const;

export type RoomKind = (typeof ROOM_KINDS)[number];

/**
 * Le remplissage au rendu. Séparé de la nature parce qu'il dit autre chose :
 * la nature classe la pièce, le remplissage la fait ressortir. Une salle de
 * contrôle est technique, et elle est en ambre le jour où elle porte
 * l'objectif d'un contrat.
 */
export const ROOM_FILLS = [
  "plain",
  "mass",
  "corridor",
  "objective",
  "access",
  "none",
] as const;

export type RoomFill = (typeof ROOM_FILLS)[number];

export const DOOR_KINDS = ["single", "double", "airlock", "opening"] as const;

export type DoorKind = (typeof DOOR_KINDS)[number];

export function isRoomKind(value: string): value is RoomKind {
  return (ROOM_KINDS as readonly string[]).includes(value);
}

export function isRoomFill(value: string): value is RoomFill {
  return (ROOM_FILLS as readonly string[]).includes(value);
}

export function isDoorKind(value: string): value is DoorKind {
  return (DOOR_KINDS as readonly string[]).includes(value);
}

/**
 * Une pièce. Coordonnées en centimètres entiers, origine en haut à gauche de
 * l'emprise du plan — les mêmes unités pour tout ce qui se dessine, de sorte
 * qu'une cote se lise sans conversion.
 */
export type PlanRoom = {
  id: string;
  name: string;
  kind: RoomKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Degrés entiers, sens horaire, autour du centre de la pièce, dans
   * `]-180, 180]`.
   *
   * Le champ existe pour un cas précis : une salle d'antenne est orientée sur
   * son relais, pas sur la trame du bâtiment. Sans lui, on ne peut relever ces
   * lieux-là qu'en mentant sur leur géométrie.
   */
  rot: number;
  fill: RoomFill;
  /**
   * Les sommets d'une pièce qui n'est pas un rectangle, en paires plates de
   * centimètres — `[x0, y0, x1, y1, …]`, dans le repère du relevé.
   *
   * `x/y/w/h` restent la boîte englobante quand ce champ est là : c'est ce qui
   * permet à la rotation, à la sélection et aux cotes de l'inspecteur de ne rien
   * savoir de la forme. Un bâtiment en L est une pièce, pas deux.
   */
  points?: number[];
  /** Un escalier : la pièce porte le hachurage, et le sens qu'il indique. */
  stair?: "up" | "down";
  /** Si le nom part au rendu. Une gaine technique n'a pas à se nommer. */
  label: boolean;
  note?: string;
};

/** Un pan de mur seul, là où il ne borde aucune pièce : une façade, un muret. */
export type PlanWall = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
};

/**
 * Une porte. Elle ne connaît pas les pièces qu'elle relie : elle est posée sur
 * un mur, et c'est sa position qui dit ce qu'elle ouvre. Lier une porte à deux
 * pièces obligerait à réparer ce lien à chaque fois qu'on déplace un mur.
 */
export type PlanDoor = {
  id: string;
  kind: DoorKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
};

/**
 * Une cote : deux points, et la distance entre eux.
 *
 * La longueur n'est pas stockée — elle se calcule au rendu. Une cote saisie à la
 * main finit par mentir le jour où l'on déplace ce qu'elle mesurait, et une
 * mesure fausse sur un plan vaut moins que pas de mesure du tout.
 */
export type PlanMeasure = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** Un texte libre posé sur le plan, indépendant des pièces. */
export type PlanLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
  rot: number;
};

/**
 * Un niveau. Un lieu se relève étage par étage, et chaque étage est une feuille
 * complète : ses pièces, ses murs, ses portes. Rien n'est partagé entre deux
 * niveaux, pas même un mur mitoyen — le jour où l'un bouge, l'autre ne doit pas
 * bouger avec lui sans qu'on l'ait demandé.
 */
export type PlanLevel = {
  id: string;
  name: string;
  /** Du bas vers le haut : le sous-sol avant le rez-de-chaussée. */
  order: number;
  rooms: PlanRoom[];
  walls: PlanWall[];
  doors: PlanDoor[];
  labels: PlanLabel[];
  measures: PlanMeasure[];
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
 *
 * Le paramètre décrit ce qui est réellement inspecté, pas un plan entier :
 * certaines lectures ne projettent que de quoi nommer et distinguer, et
 * exiger `imageUrl` ou `markers` obligerait à mentir sur ce qu'elles ramènent.
 */
export function isPlacePlanRef(
  plan: Partial<PlacePlanRef>,
): plan is PlacePlanRef {
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
