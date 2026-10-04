/**
 * Les contributions de la communauté : tout ce qu'un joueur connecté ajoute au
 * catalogue sans en avoir la permission d'édition.
 *
 * Une contribution est l'unité de relecture, de crédit et de retour arrière.
 * Elle ne remplace pas les écritures d'administration : publiée, elle passe par
 * les mêmes fonctions que l'admin (`lib/places.ts`…), avec leurs validations.
 *
 * Les points ne sont crédités qu'à la publication, jamais à l'envoi : proposer
 * dix fois n'importe quoi ne rapporte rien. Ils sont écrits dans un registre
 * (`pointEvents`) plutôt que seulement incrémentés, pour pouvoir être retirés
 * quand une contribution est annulée.
 */

/**
 * Ce qu'une contribution apporte :
 * - `media` : des images dans la galerie d'un lieu ;
 * - `placeCreate`, `placeEdit` : un lieu proposé, ou des champs d'un lieu ;
 * - `plan` : un plan d'un lieu, ajouté ou repris (image ou dessiné) ;
 * - `itemCreate`, `itemEdit` : un objet proposé, ou des champs d'un objet.
 */
export const CONTRIBUTION_KINDS = [
  "media",
  "placeCreate",
  "placeEdit",
  "plan",
  "itemCreate",
  "itemEdit",
] as const;

export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export function isContributionKind(value: string): value is ContributionKind {
  return (CONTRIBUTION_KINDS as readonly string[]).includes(value);
}

/**
 * `changesRequested` renvoie la contribution à son auteur avec un message ;
 * sans reprise sous 14 jours, elle est refusée. `reverted` est une publication
 * annulée après coup : l'état d'avant est rétabli et les points retirés.
 * `publishing` ne dure que le temps d'écrire : c'est le verrou de la
 * publication, et il ne s'affiche nulle part.
 */
export const CONTRIBUTION_STATUSES = [
  "pending",
  "changesRequested",
  "publishing",
  "published",
  "rejected",
  "reverted",
] as const;

export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/**
 * Pourquoi une contribution est refusée. Fermée, comme les motifs de
 * signalement à venir : c'est ce que l'auteur lit, et ce que l'admin compte.
 * Les libellés vivent dans `messages/*.json` sous `Contributions.reasons`.
 */
export const REJECT_REASONS = [
  "inaccurate",
  "offTopic",
  "quality",
  "personalInterface",
  "duplicate",
  "copyright",
  "other",
  "expired",
] as const;

/** Ce qu'un relecteur peut choisir ; `expired` n'est posé que par l'échéance. */
export const REVIEWER_REJECT_REASONS = REJECT_REASONS.filter(
  (reason) => reason !== "expired",
);

export type RejectReason = (typeof REJECT_REASONS)[number];

export function isRejectReason(value: string): value is RejectReason {
  return (REJECT_REASONS as readonly string[]).includes(value);
}

/** Ce que vise une contribution : un lieu (ou un de ses plans), ou un objet. */
export type ContributionTarget = {
  type: "place" | "item";
  slug: string;
  /** Le nom au moment de l'envoi, pour lister sans relire chaque fiche. */
  name: string;
  /** Pour un plan : lequel. */
  planId?: string;
  /** Pour un lieu proposé : le lieu qui le contiendra. */
  parent?: { slug: string; name: string };
};

/**
 * Une ligne de l'avant/après, déjà mise en mots pour l'affichage. `field` est
 * un chemin (`vehicle.speedMax`) ; une valeur absente est un champ vide.
 */
export type ContributionChange = {
  field: string;
  before?: string;
  after?: string;
};

export type ContributionReview = {
  by: string;
  byName?: string;
  at: string;
  reason?: RejectReason;
  message?: string;
};

export type Contribution = {
  id: string;
  userId: string;
  userName?: string;
  kind: ContributionKind;
  target: ContributionTarget;
  status: ContributionStatus;
  /** Les images apportées, pour une contribution `media`. */
  mediaIds: string[];
  gameVersion?: string;
  /** Crédités ou à créditer à la publication. */
  points: number;
  createdAt: string;
  /** Absent pour une publication directe, qui n'a pas été relue. */
  review?: ContributionReview;
  publishedAt?: string;
  /** L'avant/après, pour tout ce qui n'est pas une image. */
  changes?: ContributionChange[];
  /** Ce que l'auteur a saisi, pour reprendre une contribution à corriger. */
  proposal?: unknown;
  /** D'où vient l'information : une capture, un lien, un patch. */
  source?: string;
  /** L'image d'un plan proposé, pour le juger sans l'ouvrir. */
  preview?: { url: string; width: number; height: number };
  revert?: { by: string; byName?: string; at: string };
  updatedAt?: string;
};

// ─── Images de lieux ────────────────────────────────────────────────────────

/**
 * Une image de la galerie d'un lieu. Une collection à part plutôt qu'un tableau
 * dans le lieu : une image en attente n'a rien à faire dans le document que
 * tout le monde lit, et elle porte son auteur, son crédit et son statut.
 */
export type PlaceMedia = {
  id: string;
  placeSlug: string;
  url: string;
  width: number;
  height: number;
  caption?: string;
  credit?: string;
  userId: string;
  userName?: string;
  contributionId: string;
  status: ContributionStatus;
  createdAt: string;
};

/** Une image telle que le formulaire l'envoie, déjà téléversée. */
export type PlaceMediaInput = {
  url: string;
  width: number;
  height: number;
  caption?: string;
  credit?: string;
};

export const MAX_MEDIA_PER_CONTRIBUTION = 6;
export const MAX_MEDIA_CAPTION_LENGTH = 140;
export const MAX_MEDIA_CREDIT_LENGTH = 60;
export const MAX_GAME_VERSION_LENGTH = 16;
export const MAX_REJECT_MESSAGE_LENGTH = 500;

/** Une contribution de la file d'attente, avec de quoi la juger sur pièce. */
export type PendingContribution = Contribution & {
  media: PlaceMedia[];
  authorPoints: number;
};

// ─── Points et niveaux ──────────────────────────────────────────────────────

/** Le barème de la spec, pour ce qui existe déjà. */
export const POINTS = {
  media: 10,
  /** En plus, pour la première image d'un lieu qui n'en avait aucune. */
  firstMedia: 5,
  placeCreate: 20,
  itemCreate: 20,
  /** Un plan dessiné, dès qu'il compte une pièce. */
  planDrawn: 60,
  planImage: 30,
  /** Une section d'objet qui était vide. */
  section: 10,
  /** Toute autre correction de champs, plan repris compris. */
  edit: 5,
} as const;

/**
 * Les niveaux sont aussi des niveaux de confiance : c'est le niveau qui décide
 * si une contribution est relue avant ou après sa publication.
 *
 * Le cinquième ne se gagne pas : il est attribué par un admin (`trustLevel`).
 */
export const LEVELS = [
  { level: 1, key: "recruit", minPoints: 0 },
  { level: 2, key: "scout", minPoints: 50 },
  { level: 3, key: "cartographer", minPoints: 200 },
  { level: 4, key: "archivist", minPoints: 600 },
  { level: 5, key: "pillar", minPoints: Number.POSITIVE_INFINITY },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

/** Le niveau que valent des points, avant fiabilité et décision d'un admin. */
export function levelForPoints(points: number) {
  // Le cinquième niveau ne se gagne pas : la recherche s'arrête au quatrième.
  return [...LEVELS]
    .filter((entry) => entry.level < 5)
    .reverse()
    .find((entry) => points >= entry.minPoints)!;
}

/**
 * Monter de niveau demande aussi d'être fiable : au moins 80 % d'acceptation
 * sur les 20 dernières contributions relues. Un gros contributeur peu soigneux
 * reste relu.
 */
export const MIN_ACCEPTANCE_RATE = 0.8;
export const ACCEPTANCE_WINDOW = 20;
/** En deçà, un seul refus ferait tomber sous les 80 % : on ne juge pas encore. */
export const MIN_REVIEWED_FOR_RATE = 5;

/** Une Recrue n'a pas plus de cinq contributions en attente à la fois. */
export const MAX_PENDING_RECRUIT = 5;

/** À partir de ce niveau, les images sont publiées sans relecture préalable. */
export const DIRECT_MEDIA_LEVEL = 2;

/**
 * Pas plus d'images publiées sans relecture par jour et par joueur (hors
 * niveau 5) : au-delà, elles attendent dans la file comme les autres.
 */
export const DIRECT_MEDIA_DAILY_CAP = 12;

/**
 * À partir de ce niveau, lieux, plans et objets sont publiés tout de suite et
 * relus après coup, dans le journal.
 */
export const DIRECT_EDIT_LEVEL = 3;

/** Pas plus de publications directes (hors images) par jour, hors niveau 5. */
export const DIRECT_EDIT_DAILY_CAP = 20;

/** Renommer un lieu ou un objet, déplacer un lieu, changer un type d'objet. */
export const RENAME_LEVEL = 4;

/** Une contribution à corriger sans reprise après ce délai est refusée. */
export const CHANGES_REQUESTED_TTL_DAYS = 14;

/**
 * Une correction du même auteur sur la même fiche dans ces 24 heures ne
 * rapporte rien de plus : enregistrer dix fois un plan n'en fait pas dix.
 */
export const REPEAT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const MAX_SOURCE_LENGTH = 500;

export const CONTRIBUTIONS_REVIEW_PERMISSION = "contributions:review";

export type ContributorStanding = {
  points: number;
  level: number;
  levelKey: LevelKey;
  /** Points du prochain niveau, absent au niveau 4 et au-delà. */
  nextLevelPoints?: number;
  /** Sur les dernières contributions relues ; absent sans aucune relecture. */
  acceptanceRate?: number;
  pending: number;
  /** Contributions suspendues par la modération jusque-là. */
  suspendedUntil?: string;
};

/** Les erreurs que le formulaire sait expliquer, par leur code. */
export const CONTRIBUTION_ERRORS = [
  "unauthenticated",
  "placeNotFound",
  "noMedia",
  "tooManyMedia",
  "invalidMedia",
  "tooManyPending",
  "notFound",
  "notPending",
  "ownContribution",
  "itemNotFound",
  "invalidInput",
  "noChange",
  "duplicate",
  "notAllowed",
  "messageRequired",
  "notPublished",
  "revertConflict",
  "revertFailed",
  "applyFailed",
  "suspended",
] as const;

export type ContributionErrorCode = (typeof CONTRIBUTION_ERRORS)[number];

/** Ce que l'envoi répond : publiée tout de suite, ou en attente de relecture. */
export type SubmitContributionResult = {
  contribution: Contribution;
  standing: ContributorStanding;
};
