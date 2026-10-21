import "server-only";
import type { ObjectId } from "mongodb";
import db from "@/lib/db";

/**
 * Ce qu'un joueur sans droit d'édition peut téléverser par heure, toutes
 * images confondues : galeries et plans des lieux, bannières d'évènements. Un
 * relevé envoie son aperçu à chaque enregistrement : la limite laisse
 * dessiner, pas remplir le stockage.
 */
export const UPLOADS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

const uploadGrants = () =>
  db.db().collection<{ userId: ObjectId; at: Date }>("uploadGrants");

/** Compte un envoi ; `false` au-delà du plafond horaire, sans le compter. */
export async function tryGrantUpload(userId: ObjectId): Promise<boolean> {
  const now = new Date();
  const recent = await uploadGrants().countDocuments({
    userId,
    at: { $gte: new Date(now.getTime() - HOUR_MS) },
  });
  if (recent >= UPLOADS_PER_HOUR) return false;
  await uploadGrants().insertOne({ userId, at: now });
  return true;
}

/** Comme `tryGrantUpload`, pour `handleUpload` : refuse par une erreur. */
export async function grantUpload(userId: ObjectId): Promise<void> {
  if (!(await tryGrantUpload(userId))) {
    throw new Error("Too many uploads, try again later.");
  }
}
