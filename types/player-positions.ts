import type { PlacePosition } from "@/types/places";

/**
 * Le suivi de position : un joueur en jeu partage sa dernière position avec
 * ses amis et les membres des organisations qu'il choisit, qui la voient sur
 * la Star Map et dans le NPS de l'app.
 *
 * Rien n'est partagé sans l'avoir activé. Seule la dernière position est
 * gardée, jamais d'historique ; elle s'efface quand le joueur arrête de jouer
 * (la présence « En jeu », `types/presence.ts`), quand il cesse de partager,
 * ou `POSITION_TTL_MINUTES` après le dernier relevé.
 */

/** Sans nouveau relevé depuis, une position est masquée, même en jeu. */
export const POSITION_TTL_MINUTES = 30;

/** Sans nouveau relevé depuis, une position s'estompe et affiche son âge. */
export const POSITION_STALE_MS = 2 * 60 * 1000;

/** Le rythme auquel la Star Map relit les positions. */
export const PLAYERS_REFRESH_MS = 10_000;

/** D'où vient une position : suivi à l'écran, /showlocation, ou saisie. */
export const POSITION_SOURCES = ["screen", "showlocation", "paste"] as const;

export type PositionSource = (typeof POSITION_SOURCES)[number];

export function isPositionSource(value: unknown): value is PositionSource {
  return (POSITION_SOURCES as readonly unknown[]).includes(value);
}

/** Qui voit ma position : mes amis, et les organisations cochées. */
export type PositionSharing = {
  enabled: boolean;
  friends: boolean;
  orgIds: string[];
};

/** Une de mes organisations, à cocher. */
export type SharingOrg = {
  id: string;
  name: string;
  tag?: string;
  members: number;
};

/** Une position relevée, et ce qui la situe. */
export type PlayerPosition = {
  systemSlug: string;
  systemName?: string;
  bodySlug?: string;
  bodyName?: string;
  /** Sur un corps, dans son repère ; dans l'espace, dans celui du système. */
  position: PlacePosition;
  source: PositionSource;
  /** Heure du relevé, ISO. */
  at: string;
};

/** Mon réglage, de quoi le modifier, et ce que je partage en ce moment. */
export type MyPositionSharing = {
  sharing: PositionSharing;
  orgs: SharingOrg[];
  friends: number;
  playing: boolean;
  position: PlayerPosition | null;
};

/** Ce que l'app ou le site envoie : `PUT /api/me/position`. */
export type PositionInput = {
  /** Requis dans l'espace ; sur un corps, c'est le sien. */
  systemSlug?: string;
  position: PlacePosition;
  source?: PositionSource;
};

/** Un joueur en jeu qui partage sa position avec moi, ou moi-même. */
export type PlayerInGame = PlayerPosition & {
  userId: string;
  name: string;
  avatar: string | null;
  /** Moi : ma propre position, telle que les autres la voient. */
  me: boolean;
  friend: boolean;
  /** Les organisations par lesquelles je le vois. */
  orgs: { id: string; name: string; tag?: string }[];
  activity: string | null;
  /** Depuis quand il joue, ISO. */
  since: string;
};
