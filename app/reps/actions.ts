"use server";

import { auth } from "@/auth";
import { getFaction } from "@/lib/reputations";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { revalidatePath } from "next/cache";

export async function setPlayerReputation(
  factionName: string,
  levelName: string,
) {
  const session = await auth();

  if (!session || !session.user) {
    throw new Error("User not authenticated");
  }

  const faction = await getFaction(factionName);

  if (!faction) {
    throw new Error("Faction not found");
  }

  const level = faction.levels.find((l) => l.name === levelName);

  if (!level) {
    throw new Error("Invalid level");
  }

  await db
    .db()
    .collection("users")
    .updateOne(
      {
        _id: new ObjectId(session.user.id),
      },
      {
        $set: {
          [`reputations.${factionName}`]: level,
        },
      },
    );

  revalidatePath("/reps");
}
