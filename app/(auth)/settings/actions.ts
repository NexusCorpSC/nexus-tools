"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { setLeaderboardVisibility } from "@/lib/gamification";

/** Se retirer du classement public des contributeurs, ou y revenir. */
export async function setLeaderboardHiddenAction(hidden: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  await setLeaderboardVisibility(new ObjectId(session.user.id), hidden);
  revalidatePath("/classement");
  revalidatePath("/contributions");
}
