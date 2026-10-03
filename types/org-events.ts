import type { SquadRoleIcon } from "@/types/squad";

/**
 * Les évènements d'une organisation : un membre prévoit une sortie dans le
 * calendrier de l'orga, les autres s'y inscrivent.
 *
 * L'inscription peut demander un rôle — choisi parmi ceux que l'organisateur a
 * définis, avec les mêmes glyphes que les rôles d'escouade, pour qu'une
 * escouade tirée de l'évènement les reprenne tels quels — et des réponses à des
 * questions libres.
 *
 * Se désinscrire ne supprime rien : la ligne reste, marquée `withdrawn`, avec
 * ses réponses, mais ne compte plus dans ce que l'organisateur lit. Se
 * réinscrire la reprend.
 *
 * « Évènement » au sens du calendrier : rien à voir avec le flux d'évènements
 * temps réel de `types/events.ts`.
 */

export const ORG_EVENT_TITLE_MAX_LENGTH = 80;
export const ORG_EVENT_DESCRIPTION_MAX_LENGTH = 4000;
export const ORG_EVENT_MEETING_POINT_MAX_LENGTH = 120;
export const ORG_EVENT_ROLE_LABEL_MAX_LENGTH = 24;
export const ORG_EVENT_MAX_ROLES = 24;
export const ORG_EVENT_QUESTION_MAX_LENGTH = 200;
export const ORG_EVENT_MAX_QUESTIONS = 10;
export const ORG_EVENT_ANSWER_MAX_LENGTH = 1000;
export const ORG_EVENT_MAX_REGISTRATIONS = 200;

/** Au-delà, ce n'est plus une session de jeu : une saisie à reprendre. */
export const ORG_EVENT_MAX_DURATION_HOURS = 48;

/**
 * `private` : les membres de l'organisation seulement — le défaut.
 * `public` : tout le monde peut le lire ; s'y inscrire reste réservé aux
 * membres.
 */
export const ORG_EVENT_VISIBILITIES = ["private", "public"] as const;
export type OrgEventVisibility = (typeof ORG_EVENT_VISIBILITIES)[number];

/** Un rôle proposé à l'inscription, au même format qu'un rôle d'escouade. */
export interface OrgEventRole {
  /** Opaque et stable : renommer un rôle ne change pas ce que portent les inscrits. */
  id: string;
  label: string;
  icon: SquadRoleIcon;
  /**
   * Combien l'organisateur en souhaite, `null` pour « pas d'objectif ».
   * Un souhait, pas un plafond : on s'inscrit encore une fois le compte
   * atteint, et les pages disent ce qui manque plutôt que de refuser.
   */
  wanted: number | null;
}

export interface OrgEventQuestion {
  id: string;
  label: string;
  required: boolean;
}

export interface OrgEventRegistration {
  userId: string;
  /** Copié à l'inscription, rafraîchi à chaque écriture de l'inscrit. */
  name: string;
  /** L'id d'un des `roles`, ou `""` pour aucun. */
  role: string;
  /** Par id de question ; une question sans réponse est absente. */
  answers: Record<string, string>;
  /** Désinscrit : gardé, mais hors des comptes. */
  withdrawn: boolean;
  registeredAt: string;
  updatedAt: string;
}

export interface OrgEventAuthor {
  userId: string;
  name: string;
}

/** Ce que tout lecteur autorisé voit d'un évènement. */
export interface OrgEvent {
  id: string;
  orgId: string;
  title: string;
  description: string;
  /** ISO. */
  startsAt: string;
  /** ISO, après `startsAt`. */
  endsAt: string;
  /** Texte libre : « Hangar 03 de Lorville », « QT vers Nyx ». */
  meetingPoint: string;
  /** Un lieu de la base, quand le point de rendez-vous en est un. */
  meetingPlace: { slug: string; name: string } | null;
  visibility: OrgEventVisibility;
  roles: OrgEventRole[];
  questions: OrgEventQuestion[];
  createdBy: OrgEventAuthor;
  /** L'escouade tirée de l'évènement, `null` tant qu'il n'y en a pas. */
  squadId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Un inscrit tel que les membres le voient : sans ses réponses. */
export interface OrgEventParticipant {
  userId: string;
  name: string;
  role: string;
}

/**
 * Un évènement vu par un lecteur : de quoi l'afficher, et ce que ce lecteur
 * peut y faire.
 */
export interface OrgEventView extends OrgEvent {
  /** Inscrits actifs, désinscrits exclus. */
  registrationCount: number;
  /**
   * Inscrits actifs par id de rôle, `""` pour ceux qui n'en ont pas — visible
   * de tous les lecteurs, comme le total : c'est ce qui dit ce qui manque.
   */
  roleCounts: Record<string, number>;
  /**
   * Les inscrits actifs, pour les membres de l'organisation ; vide pour un
   * visiteur d'un évènement public, qui ne voit que le nombre.
   */
  participants: OrgEventParticipant[];
  /** L'inscription du lecteur, désinscrite comprise ; `null` s'il n'en a pas. */
  myRegistration: OrgEventRegistration | null;
  /** Membre de l'organisation : peut s'inscrire. */
  canRegister: boolean;
  /** Créateur ou éditeur de l'organisation : peut modifier, supprimer, lire le résumé. */
  canManage: boolean;
}

/**
 * Ce que l'organisateur lit : les inscrits actifs avec leurs réponses, et les
 * comptes par rôle. Les désinscrits sont listés à part, sans entrer dans
 * aucun compte.
 */
export interface OrgEventSummary {
  eventId: string;
  registrationCount: number;
  /** Par id de rôle ; `""` compte ceux qui n'en ont pas. */
  roleCounts: Record<string, number>;
  registrations: OrgEventRegistration[];
  withdrawn: OrgEventRegistration[];
}

/** Ce qu'un client envoie pour créer ou modifier un évènement. */
export interface OrgEventInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  meetingPoint?: string;
  /** Le slug d'un lieu, ou `null` pour aucun. */
  meetingPlaceSlug?: string | null;
  visibility?: OrgEventVisibility;
  /** Un rôle sans `id` est nouveau ; avec, il garde celui qu'il avait. */
  roles?: {
    id?: string;
    label: string;
    icon: SquadRoleIcon;
    wanted?: number | null;
  }[];
  questions?: { id?: string; label: string; required?: boolean }[];
}

/** Ce qu'un membre envoie pour s'inscrire ou modifier son inscription. */
export interface OrgEventRegistrationInput {
  role?: string;
  answers?: Record<string, string>;
}
