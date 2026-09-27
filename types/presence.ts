/**
 * Ce que chacun déclare de sa session de jeu, et ce que ses organisations en
 * voient.
 *
 * Auto-déclaré, jamais déduit : rien ne sait si quelqu'un joue, sinon lui. Une
 * déclaration s'éteint d'elle-même après `PRESENCE_TTL_HOURS` — quelqu'un qui
 * ferme le jeu sans le dire ne reste pas « en jeu » pour toujours. Nexus App la
 * renouvelle tant qu'elle tourne.
 */

export const PRESENCE_ACTIVITY_MAX_LENGTH = 80;

export const PRESENCE_TTL_HOURS = 4;

/** Des idées d'activité, proposées à la saisie : le champ reste libre. */
export const PRESENCE_ACTIVITY_SUGGESTIONS = [
  "Minage",
  "Commerce",
  "Transport",
  "Chasse de primes",
  "Combat",
  "Exploration",
  "Récupération",
  "Industrie",
  "Missions",
  "Course",
  "Social",
] as const;

/** Ma déclaration, telle que je la relis. */
export interface MyPresence {
  playing: boolean;
  /** Vide quand rien n'est précisé. */
  activity: string | null;
  /** Depuis quand je joue, ISO ; `null` si je ne joue pas. */
  since: string | null;
  /** Quand la déclaration s'éteint, ISO ; `null` si je ne joue pas. */
  expiresAt: string | null;
}

export const NOT_PLAYING: MyPresence = {
  playing: false,
  activity: null,
  since: null,
  expiresAt: null,
};

/** Un membre d'une organisation en train de jouer. */
export interface MemberPresence {
  userId: string;
  name: string;
  avatar: string | null;
  rank: string | null;
  activity: string | null;
  since: string;
}

export interface OrgPresence {
  orgId: string;
  playing: MemberPresence[];
  /** Nombre total de membres, pour dire « 3 sur 12 ». */
  memberCount: number;
}
