import { ObjectId } from "bson";

export type FactionDb = {
  _id: ObjectId;
  name: string;
  /** GUID de la faction dans le jeu : la clé qu'un ré-import retrouve. */
  gameId?: string;
};
