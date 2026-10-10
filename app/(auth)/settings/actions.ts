"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { setLeaderboardVisibility } from "@/lib/gamification";
import db from "@/lib/db";

/** Se retirer du classement public des contributeurs, ou y revenir. */
export async function setLeaderboardHiddenAction(hidden: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await setLeaderboardVisibility(new ObjectId(session.user.id), hidden);
  revalidatePath("/classement");
  revalidatePath("/contributions");
}

/**
 * Retire l'accès d'une application connectée (un assistant MCP) : le
 * consentement disparaît, et ses jetons de rafraîchissement sont révoqués pour
 * qu'elle ne puisse plus en obtenir de nouveaux. Le jeton d'accès en cours
 * reste valable jusqu'à son expiration (une heure au plus).
 */
export async function revokeConnectedAppAction(consentId: string) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) throw new Error("Unauthorized");

  const consent = await auth.api.getOAuthConsent({
    query: { id: consentId },
    headers: requestHeaders,
  });
  await auth.api.deleteOAuthConsent({
    body: { id: consentId },
    headers: requestHeaders,
  });

  const userIds: (string | ObjectId)[] = [session.user.id];
  if (ObjectId.isValid(session.user.id)) userIds.push(new ObjectId(session.user.id));
  await db
    .db()
    .collection("oauthRefreshTokens")
    .updateMany(
      { clientId: consent.clientId, userId: { $in: userIds }, revoked: null },
      { $set: { revoked: new Date() } },
    );
  revalidatePath("/settings");
}
