/**
 * Le partage avec des joueurs précis (voir `lib/shares.ts`) : inviter un
 * joueur, et pour les évènements un lien qui ouvre l'accès à quiconque l'a.
 */

/** Ce qui se partage. */
export const SHARE_KINDS = ["event", "place", "markerCollection"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export function isShareKind(value: unknown): value is ShareKind {
  return (SHARE_KINDS as readonly unknown[]).includes(value);
}

/** Invité par quelqu'un, ou venu par le lien de partage en étant connecté. */
export type ShareVia = "invite" | "link";

/**
 * Joueurs invités sur un même objet ; autant au plus venus par son lien (au-delà,
 * le lien se lit encore, sans garder l'objet dans ses listes).
 */
export const MAX_SHARES_PER_TARGET = 100;

/** Invitations qu'un joueur envoie en 24 heures, tous objets confondus. */
export const MAX_INVITES_PER_DAY = 50;

/** Les caractères d'un jeton de lien, de l'alphabet des codes d'escouade. */
export const SHARE_LINK_TOKEN_LENGTH = 10;

/** Un joueur qui a l'objet par le partage, tel que le panneau le montre. */
export type ShareEntry = {
  userId: string;
  name: string;
  avatar: string | null;
  via: ShareVia;
  invitedByName: string | null;
  createdAt: string;
  /** Il a vu l'invitation, ou ouvert l'objet. */
  seen: boolean;
};

/** `GET /api/shares/{kind}/{id}` : le panneau de partage. */
export type SharePanelData = {
  title: string;
  shares: ShareEntry[];
  /** Les types qui proposent un lien (les évènements) ; `null` sinon. */
  link: { url: string; createdAt: string } | null;
  allowLink: boolean;
  /** Les membres de l'organisation qui voient déjà l'objet, s'il y en a. */
  org: { name: string; memberCount: number } | null;
};

/** Un joueur à inviter : ses amis d'abord. */
export type ShareCandidate = {
  userId: string;
  name: string;
  avatar: string | null;
  isFriend: boolean;
  /** Il a déjà l'objet. */
  hasAccess: boolean;
};

/** Une invitation reçue, dans la cloche. */
export type Invitation = {
  id: string;
  kind: ShareKind;
  targetId: string;
  title: string;
  /** Un évènement : quand, et de quelle organisation. */
  startsAt?: string;
  orgName?: string;
  /** Un lieu privé : son type, et le lieu public qui le contient. */
  placeType?: string;
  parentName?: string;
  /** Une collection de marqueurs : combien elle en contient. */
  markerCount?: number;
  /** La fiche à ouvrir, chemin du site. */
  href: string;
  invitedByName: string;
  createdAt: string;
  seen: boolean;
};

/** `GET /api/me/invitations` */
export type InvitationsResponse = {
  invitations: Invitation[];
  unseen: number;
};
