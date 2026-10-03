/**
 * Ce que chacun déclare de sa session de jeu, et ce que ses organisations et
 * ses amis en voient.
 *
 * Auto-déclaré, jamais déduit : rien ne sait si quelqu'un joue, sinon lui. Une
 * déclaration s'éteint d'elle-même après `PRESENCE_TTL_HOURS` — quelqu'un qui
 * ferme le jeu sans le dire ne reste pas « en jeu » pour toujours. Nexus App la
 * renouvelle tant qu'elle tourne.
 */

export const PRESENCE_ACTIVITY_MAX_LENGTH = 80;

export const PRESENCE_TTL_HOURS = 4;

/**
 * Une session prévue reste affichée jusqu'à une heure après l'heure dite :
 * quelqu'un en retard est encore « prévu », pas « hors jeu ».
 */
export const PLANNED_SESSION_GRACE_HOURS = 1;

/** Au-delà, ce n'est plus « ma prochaine session » mais un agenda. */
export const PLANNED_SESSION_MAX_DAYS_AHEAD = 14;

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

/** « 1 h 20 », « 45 min » : depuis quand, à partir d'une date ISO. */
export function formatElapsed(since: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(since)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

/** L'évènement d'organisation d'où vient une session prévue. */
export interface PlannedEventRef {
  orgId: string;
  eventId: string;
  title: string;
}

/**
 * Ma prochaine session : à quelle heure, pour faire quoi. Une seule par
 * personne ; en prévoir une autre la remplace. Elle s'efface
 * `PLANNED_SESSION_GRACE_HOURS` après l'heure dite, ou quand je commence à
 * jouer — son activité devient alors celle de la session.
 */
export interface PlannedSession {
  /** ISO. */
  at: string;
  activity: string | null;
  /**
   * Quand elle reprend un évènement d'organisation. Absent de ce que voient
   * les amis : un évènement privé ne regarde que les membres de l'orga.
   */
  event: PlannedEventRef | null;
}

/** Ma déclaration, telle que je la relis. */
export interface MyPresence {
  playing: boolean;
  /** Vide quand rien n'est précisé. */
  activity: string | null;
  /** Depuis quand je joue, ISO ; `null` si je ne joue pas. */
  since: string | null;
  /** Quand la déclaration s'éteint, ISO ; `null` si je ne joue pas. */
  expiresAt: string | null;
  /** Ma prochaine session, en jeu ou non ; `null` sans session prévue. */
  planned: PlannedSession | null;
}

export const NOT_PLAYING: MyPresence = {
  playing: false,
  activity: null,
  since: null,
  expiresAt: null,
  planned: null,
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

/** Un membre d'une organisation qui a prévu une session, sans y être encore. */
export interface MemberPlanned {
  userId: string;
  name: string;
  avatar: string | null;
  rank: string | null;
  planned: PlannedSession;
}

export interface OrgPresence {
  orgId: string;
  playing: MemberPresence[];
  /**
   * Ceux qui ne jouent pas mais ont prévu une session, de la plus proche à la
   * plus lointaine. `event` n'y figure que pour un évènement de cette orga.
   */
  planned: MemberPlanned[];
  /** Nombre total de membres, pour dire « 3 sur 12 ». */
  memberCount: number;
}
