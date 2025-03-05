"use server";

import { auth } from "@/auth";
import { getFaction } from "@/lib/reputations";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { revalidatePath } from "next/cache";

export async function setPlayerReputation(
  factionName: string,
  careerName: string,
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

  const career = faction.careers.find((c) => c.name === careerName);

  if (!career) {
    throw new Error("Invalid career");
  }

  const level = career.levels.find((l) => l.name === levelName);

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
          [`reputations.${factionName}.careers.${careerName}.level`]: level,
        },
      },
    );

  revalidatePath("/reps");
}

export async function setPlayerReputationStandingAction(
  factionName: string,
  standing: string,
) {
  const session = await auth();

  if (!session || !session.user) {
    throw new Error("User not authenticated");
  }

  const faction = await getFaction(factionName);

  if (!faction) {
    throw new Error("Faction not found");
  }

  if (!faction.standings || !faction.standings.includes(standing)) {
    throw new Error("Invalid standing");
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
          [`reputations.${factionName}.standing`]: standing,
        },
      },
    );
}
