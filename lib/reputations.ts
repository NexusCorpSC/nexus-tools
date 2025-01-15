import "server-only";
import db from "@/lib/db";
import { ObjectId } from "bson";

export type FactionLevel = {
  level: number;
  name: string;
  isDefault: boolean;
};

export type Faction = {
  name: string;
  levels: FactionLevel[];
};

export async function getFactions() {
  const factionsConfig = await db
    .db()
    .collection<{ factions: Faction[] }>("configuration")
    .findOne({ key: "reputations" });

  if (!factionsConfig) {
    return null;
  }

  return factionsConfig.factions;
}

export async function getFaction(factionName: string) {
  const factions = await getFactions();

  if (!factions) {
    return null;
  }

  return factions.find((faction) => faction.name === factionName);
}

export async function getPlayerReputations(playerId: string) {
  const player = await db
    .db()
    .collection("users")
    .findOne(
      { _id: new ObjectId(playerId) },
      { projection: { reputations: -1 } },
    );

  if (!player) {
    throw new Error(`Player not found.`);
  }

  return player.reputations ?? {};
}
