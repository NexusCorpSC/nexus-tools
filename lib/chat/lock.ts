import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";

/**
 * Une réponse à la fois par joueur, toutes conversations confondues : le
 * budget restant est lu au début d'une réponse, et l'historique est
 * réécrit à sa fin. Deux réponses en même temps (le site, l'app et
 * l'overlay, ou un script) dépenseraient chacune tout le reste du mois, et
 * la dernière à finir effacerait le tour de l'autre.
 *
 * Le verrou expire de lui-même (une réponse dure `maxDuration` au plus) :
 * une requête coupée net ne bloque pas le joueur.
 */
export interface DbChatLock {
  /** Le joueur. */
  _id: ObjectId;
  /** Distingue la réponse qui tient le verrou d'une suivante. */
  token: string;
  conversationId: string;
  /** Le joueur a demandé l'arrêt : la réponse s'arrête après l'étape en cours. */
  stopRequested: boolean;
  expiresAt: Date;
}

function locks() {
  return db.db().collection<DbChatLock>("chatLocks");
}

/**
 * Prend le verrou du joueur pour `ttlMs`. `null` si une autre réponse le
 * tient encore.
 */
export async function acquireChatLock(
  userId: ObjectId,
  conversationId: string,
  ttlMs: number,
): Promise<string | null> {
  const now = new Date();
  const token = new ObjectId().toHexString();
  try {
    await locks().updateOne(
      { _id: userId, expiresAt: { $lte: now } },
      {
        $set: {
          token,
          conversationId,
          stopRequested: false,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      },
      { upsert: true },
    );
    return token;
  } catch (error) {
    // Le verrou existe et n'a pas expiré : l'upsert heurte la clé `_id`.
    if ((error as { code?: number } | null)?.code === 11000) return null;
    throw error;
  }
}

/** Rend le verrou, s'il est toujours à cette réponse. */
export async function releaseChatLock(
  userId: ObjectId,
  token: string,
): Promise<void> {
  await locks().deleteOne({ _id: userId, token });
}

/** Le joueur a appuyé sur « Arrêter » : la réponse en cours s'arrête. */
export async function requestChatStop(userId: ObjectId): Promise<void> {
  await locks().updateOne(
    { _id: userId, expiresAt: { $gt: new Date() } },
    { $set: { stopRequested: true } },
  );
}

/** La réponse qui tient `token` doit-elle s'arrêter ? */
export async function chatStopRequested(
  userId: ObjectId,
  token: string,
): Promise<boolean> {
  const lock = await locks().findOne(
    { _id: userId, token },
    { projection: { stopRequested: 1 } },
  );
  // Verrou perdu (expiré, repris) : mieux vaut s'arrêter.
  return !lock || lock.stopRequested;
}
