import type { PlannedSession } from "@/types/presence";

/**
 * Les amis d'un joueur, et le code qui en fait.
 *
 * L'amitié est réciproque et naît d'un code : A en demande un, le transmet à B,
 * B le saisit — chacun apparaît alors dans la liste de l'autre et le code
 * disparaît. Un code ne sert qu'une fois ; le suivant est créé à la prochaine
 * demande.
 */

/** 8 caractères, montrés « K7QD-92PX » ; la saisie accepte l'un et l'autre. */
export const FRIEND_CODE_LENGTH = 8;

/** Le code tel qu'on le lit ou le dicte : deux groupes de quatre. */
export function formatFriendCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Ce qu'un ami déclare jouer ; `null` quand il n'est pas en jeu. */
export interface FriendPlaying {
  /** Vide quand rien n'est précisé. */
  activity: string | null;
  /** Depuis quand il joue, ISO. */
  since: string;
}

export interface Friend {
  userId: string;
  name: string;
  avatar: string | null;
  /** La première organisation que le lecteur partage avec lui, s'il y en a. */
  sharedOrg: string | null;
  /** Depuis quand vous êtes amis, ISO. */
  friendsSince: string;
  playing: FriendPlaying | null;
  /**
   * Sa prochaine session quand il ne joue pas ; `null` sinon. `event` y est
   * toujours `null` : un ami n'est pas forcément de l'organisation.
   */
  planned: PlannedSession | null;
}

/**
 * La liste : ceux en jeu d'abord, du plus ancien en jeu au plus récent ; puis
 * ceux qui ont prévu une session, de la plus proche à la plus lointaine ;
 * puis les autres par nom.
 */
export interface FriendList {
  friends: Friend[];
}

/** Mon code en attente ; `null` quand je n'en ai pas demandé ou qu'il a servi. */
export interface MyFriendCode {
  code: string | null;
}

/**
 * Pourquoi un ajout est refusé. Le code est stable — le site et l'application
 * de bureau en font chacun leur message — et accompagne le statut HTTP.
 */
export type FriendErrorCode =
  | "invalid_code"
  | "not_found"
  | "own_code"
  | "already_friends"
  | "too_many_attempts";
