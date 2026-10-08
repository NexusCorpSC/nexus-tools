/**
 * Les signalements : un joueur connecté dit qu'une fiche, une image, un plan,
 * un objet ou une organisation pose problème.
 *
 * Un dossier par cible : les signalements d'une même cible s'y empilent, et
 * c'est le dossier que la modération tranche, une fois. Chaque signalement
 * pèse selon le niveau de son auteur ; à partir d'un certain poids, une image
 * ou une organisation est masquée en attendant la décision. Une fiche de lieu
 * ou d'objet ne l'est jamais : elle affiche « Information contestée ».
 */

/**
 * Ce qu'on peut signaler. Le profil d'un contributeur viendra avec sa page
 * publique : il n'y a aujourd'hui aucun endroit où le signaler.
 */
export const REPORT_TARGET_TYPES = [
  "place",
  "placeMedia",
  "plan",
  "item",
  "org",
  "blueprint",
  "shop",
  "listing",
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export function isReportTargetType(value: unknown): value is ReportTargetType {
  return (REPORT_TARGET_TYPES as readonly unknown[]).includes(value);
}

/**
 * Ce que vise un dossier. `id` est la clé de la cible : le slug d'un lieu ou
 * d'un objet, l'identifiant d'une image ou d'une organisation, `slug:planId`
 * pour un plan. `slug` est le lieu d'une image ou d'un plan, pour y renvoyer.
 */
export type ReportTarget = {
  type: ReportTargetType;
  id: string;
  /** Le nom au moment du premier signalement, pour lister sans tout relire. */
  name: string;
  slug?: string;
  planId?: string;
  /** L'aperçu d'une image ou d'un plan, pour juger sans ouvrir la fiche. */
  imageUrl?: string;
};

/**
 * Les motifs, fermés : c'est ce que la modération compte. Les libellés vivent
 * dans `messages/*.json` sous `Reports.reasons`. `other` demande un
 * commentaire.
 */
export const REPORT_REASONS = [
  "wrong",
  "outdated",
  "duplicate",
  "media",
  "offensive",
  "copyright",
  "spam",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(value: unknown): value is ReportReason {
  return (REPORT_REASONS as readonly unknown[]).includes(value);
}

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Ce que la modération décide :
 * - `dismiss` : rien à reprocher, le dossier est classé ;
 * - `correct` : l'admin a corrigé la fiche lui-même ;
 * - `revert` : la contribution en cause est annulée ;
 * - `delete` : l'élément est retiré (pour une organisation : de la vue
 *   publique, ses membres la gardent).
 * Toutes sauf `dismiss` retiennent le signalement.
 */
export const REPORT_ACTIONS = [
  "dismiss",
  "correct",
  "revert",
  "delete",
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export function isReportAction(value: unknown): value is ReportAction {
  return (REPORT_ACTIONS as readonly unknown[]).includes(value);
}

/** Ce que chaque cible permet, au-delà du classement. */
export const REPORT_ACTIONS_BY_TARGET: Record<
  ReportTargetType,
  readonly ReportAction[]
> = {
  place: ["dismiss", "correct", "revert", "delete"],
  placeMedia: ["dismiss", "revert", "delete"],
  plan: ["dismiss", "correct", "revert", "delete"],
  item: ["dismiss", "correct", "revert", "delete"],
  org: ["dismiss", "correct", "delete"],
  // Où l'obtenir, surtout : un admin corrige la fiche, rien ne s'y annule.
  blueprint: ["dismiss", "correct"],
  // Un magasin ou une annonce ne se corrige que par ses vendeurs : la
  // modération classe, ou retire de la vue publique.
  shop: ["dismiss", "delete"],
  listing: ["dismiss", "delete"],
};

/** En plus de la décision, envers l'auteur du contenu en cause. */
export const REPORT_SANCTIONS = ["warn", "suspend"] as const;
export type ReportSanction = (typeof REPORT_SANCTIONS)[number];

export function isReportSanction(value: unknown): value is ReportSanction {
  return (REPORT_SANCTIONS as readonly unknown[]).includes(value);
}

/** Le poids à partir duquel une image, une organisation, un magasin ou une annonce est masqué. */
export const REPORT_MASK_WEIGHT = 3;

/** Un signalement de Recrue pèse 1, à partir d'Éclaireur il pèse 2. */
export function reportWeight(level: number): number {
  return level >= 2 ? 2 : 1;
}

/** Ce que masque un dossier lourd ; le reste affiche un bandeau. */
export const MASKABLE_TARGETS: readonly ReportTargetType[] = [
  "placeMedia",
  "org",
  "shop",
  "listing",
];

export const REPORTS_PER_DAY = 10;
/** Après un classement, le même compte ne resignale pas la même cible avant. */
export const REPORT_COOLDOWN_DAYS = 30;
/** Trois signalements classés d'affilée suspendent le droit de signaler. */
export const REPORT_STRIKES = 3;
export const REPORT_BAN_DAYS = 7;
/** Une suspension de contributeur, décidée sur un dossier. */
export const CONTRIBUTOR_SUSPENSION_DAYS = 7;
/** Ce que rapporte un signalement retenu. */
export const REPORT_UPHELD_POINTS = 1;

export const MAX_REPORT_COMMENT_LENGTH = 500;
export const MAX_RESOLUTION_NOTE_LENGTH = 500;

export const REPORT_ERRORS = [
  "unauthenticated",
  "invalidTarget",
  "targetNotFound",
  "invalidReason",
  "commentRequired",
  "ownContent",
  "alreadyReported",
  "dailyLimit",
  "reportingSuspended",
  "notFound",
  "notOpen",
  "invalidAction",
  "contributionRequired",
  "actionFailed",
  "busy",
  "ownDossier",
  "notAllowed",
] as const;

export type ReportErrorCode = (typeof REPORT_ERRORS)[number];

/** Ce que le formulaire envoie, sur le site comme dans l'app. */
export type ReportInput = {
  target: { type: ReportTargetType; id: string };
  reason: ReportReason;
  comment?: string;
};

export type ReportEntry = {
  userId: string;
  userName?: string;
  weight: number;
  reason: ReportReason;
  comment?: string;
  at: string;
};

export type ReportResolution = {
  action: ReportAction;
  by: string;
  byName?: string;
  at: string;
  note?: string;
  contributionId?: string;
  sanction?: ReportSanction;
  authorId?: string;
};

export type Report = {
  id: string;
  target: ReportTarget;
  status: ReportStatus;
  weight: number;
  /** Masquée en attendant la décision. */
  hidden: boolean;
  entries: ReportEntry[];
  createdAt: string;
  updatedAt: string;
  resolution?: ReportResolution;
};

/** Ce que l'API répond à un signalement. */
export type SubmitReportResult = {
  id: string;
  status: ReportStatus;
  /** Le nombre de joueurs qui ont signalé cette cible, vous compris. */
  reporters: number;
};

/** Un signalement de l'auteur, tel que sa page de contributions le liste. */
export type MyReport = {
  id: string;
  target: ReportTarget;
  reason: ReportReason;
  at: string;
  /** `open` en attente, `resolved` retenu, `dismissed` classé. */
  status: ReportStatus;
  decidedAt?: string;
};

/** Ce que la page de contributions dit des signalements du joueur. */
export type ReportingStanding = {
  reports: MyReport[];
  /** Jusqu'à quand il ne peut plus signaler. */
  bannedUntil?: string;
  /** Les avertissements reçus de la modération. */
  warnings: { at: string; note?: string }[];
  /** Jusqu'à quand ses contributions sont suspendues. */
  suspendedUntil?: string;
};
