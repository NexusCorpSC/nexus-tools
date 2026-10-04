import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import type {
  Contribution,
  ContributionChange,
  ContributionErrorCode,
  ContributionKind,
  ContributionReview,
  ContributionStatus,
  ContributionTarget,
  PlaceMedia,
  RejectReason,
} from "@/types/contributions";

/**
 * Ce que partagent les contributions de toutes natures : les documents en
 * base, leurs collections, et l'erreur qu'un formulaire sait expliquer.
 *
 * Trois collections :
 * - `contributions`, l'unité de relecture et de crédit ;
 * - `placeMedia`, les images de lieux, publiées ou non ;
 * - `pointEvents`, le registre des points. `users.contrib.points` n'en est que
 *   la somme tenue à jour, pour ne pas la recalculer à chaque affichage.
 */

/**
 * Le seul stockage dont on accepte les images : celui où `/api/lieux/upload`
 * téléverse. Une URL d'ailleurs casserait `next/image`, dont les hôtes sont
 * listés dans `next.config.ts`, et ferait du site un hébergeur de liens.
 */
export const BLOB_HOST = "gwgsmex5adyadzri.public.blob.vercel-storage.com";

export interface DbUser {
  _id: ObjectId;
  name?: string;
  isAdmin?: boolean;
  permissions?: string[];
  contrib?: {
    points?: number;
    /** Fixé par un admin, il passe avant les points. */
    trustLevel?: number;
    /** Signalements classés d'affilée ; un signalement retenu la remet à zéro. */
    reportStrikes?: number;
    /** Plus de signalement jusque-là. */
    reportBanUntil?: Date;
    /** Plus de contribution jusque-là, sur décision de la modération. */
    suspendedUntil?: Date;
    warnings?: {
      at: Date;
      by: ObjectId;
      /** Absent pour un avertissement donné depuis la fiche du contributeur. */
      reportId?: ObjectId;
      note?: string;
    }[];
    /**
     * Le niveau au dernier recalcul (`refreshProgress`) : ce que les crédits
     * et le classement affichent sans relire toutes ses contributions.
     */
    level?: number;
    /** La dernière montée de niveau, pour la notifier. */
    levelUp?: { level: number; at: Date };
    /** Les succès débloqués ; un succès débloqué le reste. */
    achievements?: { id: string; at: Date; name?: string }[];
    /** Retiré du classement public, par lui-même dans les réglages. */
    hideFromLeaderboard?: boolean;
  };
}

export interface DbContribution {
  _id: ObjectId;
  userId: ObjectId;
  userName?: string;
  kind: ContributionKind;
  target: ContributionTarget;
  status: ContributionStatus;
  mediaIds: ObjectId[];
  gameVersion?: string;
  points: number;
  createdAt: Date;
  updatedAt?: Date;
  review?: {
    by: ObjectId;
    byName?: string;
    at: Date;
    reason?: RejectReason;
    message?: string;
  };
  publishedAt?: Date;
  /**
   * Ce que l'auteur a saisi, tel quel : c'est ce que la publication applique,
   * et ce que le formulaire reprend quand la contribution revient à corriger.
   */
  proposal?: unknown;
  /** Les champs de premier niveau qu'une modification change. */
  fields?: string[];
  /** Leur valeur avant, telle qu'en base : c'est ce que l'annulation remet. */
  before?: Record<string, unknown>;
  /** Leur valeur proposée, normalisée : de quoi voir un conflit à l'annulation. */
  after?: Record<string, unknown>;
  changes?: ContributionChange[];
  source?: string;
  preview?: { url: string; width: number; height: number };
  revert?: { by: ObjectId; byName?: string; at: Date };
}

export interface DbPlaceMedia {
  _id: ObjectId;
  placeSlug: string;
  url: string;
  width: number;
  height: number;
  caption?: string;
  credit?: string;
  userId: ObjectId;
  userName?: string;
  contributionId: ObjectId;
  status: ContributionStatus;
  createdAt: Date;
  /** Masquée par un dossier de signalement, en attendant la décision. */
  hiddenByReport?: boolean;
}

export interface DbPointEvent {
  _id?: ObjectId;
  userId: ObjectId;
  /** Absent pour un signalement retenu, qui porte `reportId`. */
  contributionId?: ObjectId;
  reportId?: ObjectId;
  delta: number;
  /**
   * `firstMedia` porte le slug du lieu et `plan` la clé du plan : un index
   * unique sur ces couples fait qu'un bonus ne se touche qu'une fois, même
   * publié en même temps qu'un autre.
   */
  reason:
    | "published"
    | "firstMedia"
    | "plan"
    | "reverted"
    /** Une image retirée sur signalement : ses points repartent. */
    | "removed"
    /** Un signalement retenu. */
    | "report"
    /** Une relecture décidée, créditée au relecteur. */
    | "review"
    /** Un ajustement d'un admin, avec son motif. */
    | "adjust";
  /** Le motif d'un ajustement, et qui l'a fait. */
  note?: string;
  by?: ObjectId;
  placeSlug?: string;
  planKey?: string;
  at: Date;
}

export const users = () => db.db().collection<DbUser>("users");
export const contributions = () =>
  db.db().collection<DbContribution>("contributions");
export const placeMedia = () => db.db().collection<DbPlaceMedia>("placeMedia");
export const pointEvents = () =>
  db.db().collection<DbPointEvent>("pointEvents");

export class ContributionError extends Error {
  constructor(
    readonly code: ContributionErrorCode,
    readonly status: number,
    /** Le message d'une validation de fiche, déjà en français. */
    readonly detail?: string,
  ) {
    super(detail ?? code);
  }
}

export type Contributor = {
  id: ObjectId;
  name?: string;
  /**
   * Un joueur qui relit depuis `/contributions/review`, et non un modérateur :
   * lui seul gagne des points de relecture.
   */
  player?: boolean;
};

export function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, max).trim();
  return text || undefined;
}

export function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 11000;
}

export function toContribution(doc: DbContribution): Contribution {
  const review: ContributionReview | undefined = doc.review
    ? {
        by: String(doc.review.by),
        byName: doc.review.byName,
        at: doc.review.at.toISOString(),
        reason: doc.review.reason,
        message: doc.review.message,
      }
    : undefined;

  return {
    id: String(doc._id),
    userId: String(doc.userId),
    userName: doc.userName,
    kind: doc.kind,
    target: doc.target,
    status: doc.status,
    mediaIds: doc.mediaIds.map(String),
    gameVersion: doc.gameVersion,
    points: doc.points,
    createdAt: doc.createdAt.toISOString(),
    review,
    publishedAt: doc.publishedAt?.toISOString(),
    changes: doc.changes,
    proposal: doc.proposal,
    source: doc.source,
    preview: doc.preview,
    revert: doc.revert
      ? {
          by: String(doc.revert.by),
          byName: doc.revert.byName,
          at: doc.revert.at.toISOString(),
        }
      : undefined,
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export function toPlaceMedia(doc: DbPlaceMedia): PlaceMedia {
  return {
    id: String(doc._id),
    placeSlug: doc.placeSlug,
    url: doc.url,
    width: doc.width,
    height: doc.height,
    caption: doc.caption,
    credit: doc.credit,
    userId: String(doc.userId),
    userName: doc.userName,
    contributionId: String(doc.contributionId),
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}
