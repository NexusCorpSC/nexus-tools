/**
 * La gamification des contributions : succès, classement, crédits des fiches,
 * et ce que l'app lit pour afficher un niveau et prévenir le joueur.
 *
 * Les points et les niveaux eux-mêmes sont dans `types/contributions.ts` : ce
 * sont aussi des niveaux de confiance, qui décident de la relecture.
 */

import type { ContributionKind, LevelKey } from "@/types/contributions";

// ─── Succès ─────────────────────────────────────────────────────────────────

/**
 * Les familles de succès. Libellés dans `messages/*.json` sous
 * `Contributions.Achievements`.
 * - `firstStep` : une première contribution publiée ;
 * - `pioneer` : la première image d'un lieu qui n'en avait aucune, en trois
 *   paliers ;
 * - `cartographer` : un plan publié dans chaque quartier d'une ville, un succès
 *   par ville qui compte au moins deux quartiers ;
 * - `tour` : une contribution sur chaque planète d'un système, un par système ;
 * - `versatile` : au moins une contribution publiée de chaque nature ;
 * - `guardian` : cinq signalements retenus ;
 * - `reliable` : cinquante contributions relues d'affilée sans un refus ;
 * - `founder` : une organisation créée, validée, qui atteint dix membres.
 */
export const ACHIEVEMENT_KEYS = [
  "firstStep",
  "pioneer",
  "cartographer",
  "tour",
  "versatile",
  "guardian",
  "reliable",
  "founder",
] as const;

export type AchievementKey = (typeof ACHIEVEMENT_KEYS)[number];

export const PIONEER_TIERS = [
  { tier: "bronze", goal: 1 },
  { tier: "silver", goal: 10 },
  { tier: "gold", goal: 50 },
] as const;

export type AchievementTier = (typeof PIONEER_TIERS)[number]["tier"];

export const GUARDIAN_GOAL = 5;
export const RELIABLE_GOAL = 50;
export const FOUNDER_MEMBERS = 10;
/** Une ville ou un système plus petit n'a pas de succès à lui. */
export const MIN_DISTRICTS = 2;
export const MIN_PLANETS = 2;

/**
 * Un succès, débloqué ou non. `id` est stable et unique : `pioneer:silver`,
 * `cartographer:lorville`, `tour:stanton`. `name` est la ville ou le système.
 */
export type Achievement = {
  id: string;
  key: AchievementKey;
  tier?: AchievementTier;
  name?: string;
  /** Quand il a été débloqué ; absent tant qu'il ne l'est pas. */
  at?: string;
  /** Où en est le joueur, pour un succès pas encore débloqué. */
  progress?: { current: number; goal: number };
};

// ─── Classement ─────────────────────────────────────────────────────────────

export const LEADERBOARD_PERIODS = ["month", "all"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const LEADERBOARD_SCOPES = ["players", "orgs"] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];

export function isLeaderboardPeriod(
  value: unknown,
): value is LeaderboardPeriod {
  return (LEADERBOARD_PERIODS as readonly unknown[]).includes(value);
}

export function isLeaderboardScope(value: unknown): value is LeaderboardScope {
  return (LEADERBOARD_SCOPES as readonly unknown[]).includes(value);
}

export const LEADERBOARD_SIZE = 50;

/** Une ligne du classement : un joueur, ou une organisation et ses membres. */
export type LeaderboardEntry = {
  rank: number;
  id: string;
  name: string;
  points: number;
  /** Pour un joueur. */
  level?: number;
  /** Pour une organisation. */
  tag?: string;
  image?: string;
  members?: number;
};

export type Leaderboard = {
  period: LeaderboardPeriod;
  scope: LeaderboardScope;
  /** Le début du mois compté, pour `month`. */
  since?: string;
  entries: LeaderboardEntry[];
  /**
   * Le lecteur, pour les joueurs : son rang même hors des premiers. `hidden`
   * s'il s'est retiré du classement.
   */
  me?: { rank?: number; points: number; hidden: boolean };
};

// ─── Crédits ────────────────────────────────────────────────────────────────

/** « Fiche enrichie par » : les contributeurs d'une fiche, les plus actifs d'abord. */
export type FicheCredits = {
  contributors: { id: string; name: string; level: number; count: number }[];
  /** Ceux qui ne sont pas listés. */
  others: number;
  /** La dernière publication. */
  updatedAt?: string;
};

export const CREDITS_SHOWN = 5;

// ─── Fiche contributeur (admin) ─────────────────────────────────────────────

/** Ajuster des points à la main demande un motif, écrit au registre. */
export const MAX_ADJUST_POINTS = 1000;
export const MAX_ADJUST_REASON_LENGTH = 200;
export const MAX_SUSPENSION_DAYS = 90;

export const CONTRIBUTOR_ERRORS = [
  "notFound",
  "notAllowed",
  "self",
  "invalidLevel",
  "invalidPoints",
  "reasonRequired",
  "invalidDays",
] as const;

export type ContributorErrorCode = (typeof CONTRIBUTOR_ERRORS)[number];

/** Une ligne de l'onglet Contributeurs. */
export type ContributorRow = {
  id: string;
  name: string;
  points: number;
  level: number;
  /** Le niveau fixé à la main, s'il y en a un. */
  trustLevel?: number;
  published: number;
  acceptanceRate?: number;
  /** Les dossiers retenus contre son contenu. */
  reportsAgainst: number;
  suspendedUntil?: string;
};

// ─── Ce que l'app lit ───────────────────────────────────────────────────────

/**
 * Ce qui s'est passé depuis la dernière visite, pour une notification de
 * bureau : une contribution publiée, renvoyée à corriger, un succès.
 */
export type ContribEvent =
  | {
      type: "published";
      at: string;
      kind: ContributionKind;
      name: string;
      points: number;
    }
  | {
      type: "changesRequested";
      at: string;
      kind: ContributionKind;
      name: string;
      message?: string;
    }
  | { type: "achievement"; at: string; id: string; title: string }
  | { type: "level"; at: string; level: number; title: string };

/** `GET /api/me/contrib` : points, niveau, succès, prochain palier. */
export type ContribSummary = {
  points: number;
  level: number;
  levelKey: LevelKey;
  levelName: string;
  nextLevelPoints?: number;
  nextLevelName?: string;
  acceptanceRate?: number;
  achievements: (Achievement & { title: string })[];
  /** Les évènements après `since`, les plus anciens d'abord. */
  events: ContribEvent[];
  /** À renvoyer comme `since` à la prochaine lecture. */
  now: string;
};
