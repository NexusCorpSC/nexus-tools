import { ObjectId } from "bson";

export type MissionDb = {
  _id: ObjectId;
  category: string;
  missionType: string;
  title: string;
  description: string;
  factionId: ObjectId;
  canBeShared: boolean;
  illegal: boolean;
  rewardUEC?: number;
  blueprints: ObjectId[];
  /** Identifiant principal du contrat chez la source (scmdb). */
  id?: string;
  /** Tous les identifiants de définition et noms techniques du contrat. */
  gameIds?: string[];
  debugNames?: string[];
  /** Version du jeu dont la mission a disparu ; absente tant qu'elle existe. */
  removedInVersion?: string;
  /** La mission dans laquelle la source a fusionné celle-ci. */
  replacedBy?: ObjectId;
};

/**
 * Les missions encore proposées en jeu : l'import marque celles qui
 * disparaissent au lieu de les supprimer, pour que leurs liens restent
 * valides. Toute liste filtre avec ceci ; une page de mission, non.
 */
export const ACTIVE_MISSION = { removedInVersion: { $exists: false } } as const;
