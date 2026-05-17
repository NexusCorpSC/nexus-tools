import { readFileSync } from "fs";
import path from "node:path";
import db from "@/lib/db";

async function updateFactions() {
  const raw: {
    version: string;
    blueprintPools: {
      [blueprintPoolId: string]: {
        name: string;
        blueprints: {
          weight: 1;
          name: string;
        }[];
      };
    };
    factions: {
      [factionId: string]: {
        name: string;
        nameKey: string;
      };
    };
    contracts: {
      id: string;
      missionType: string;
      title: string;
      category: string;
      description: string;
      canBeShared: boolean;
      illegal: boolean;
      rewardUEC?: number;
      factionGuid: string;
      blueprintRewards?: {
        blueprintPool: string;
        chance: number;
        poolName: string;
      }[];
    }[];
    scopes: {
      [id: string]: {
        scopeName: string;
        ranks: {
          guid: string;
          name: string;
          nameKey: string;
          minReputation: number;
          rangeXp: number;
          rankIndex: number;
        }[];
      };
    };
  } = JSON.parse(
    await readFileSync(path.join(__dirname, "missions.json"), "utf8"),
  );

  const factions: {
    id: string;
    name: string;
  }[] = Object.entries(raw.factions)
    .map(([id, f]) => {
      return {
        id,
        nameKey: f.nameKey,
        name: f.name,
      };
    })
    .filter((f) => f.nameKey)
    .map((f) => ({
      id: f.id,
      name: f.name,
    }));

  const missions: {
    id: string;
    category: string;
    missionType: string;
    title: string;
    description: string;
    factionId: string;
    canBeShared: boolean;
    illegal: boolean;
    rewardUEC?: number;
    blueprints: string[];
  }[] = raw.contracts.map((c) => {
    const blueprints =
      c.blueprintRewards
        ?.map((pool) => pool.blueprintPool)
        .map((poolId) => raw.blueprintPools[poolId]?.blueprints)
        .flat()
        .map((bp) => bp.name) ?? [];

    return {
      id: c.id,
      category: c.category,
      missionType: c.missionType,
      title: c.title,
      description: c.description,
      factionId: c.factionGuid,
      canBeShared: c.canBeShared,
      illegal: c.illegal,
      rewardUEC: c.rewardUEC,
      blueprints,
    };
  });

  await db
    .db()
    .collection("factions")
    .insertMany(factions.map((f) => ({ name: f.name, gameId: f.id })));

  // replace blueprint names by IDs
  const missionsDb = await Promise.all(
    missions.map(async (m) => {
      return {
        ...m,
        factionId: await db
          .db()
          .collection("factions")
          .findOne({ gameId: m.factionId })
          .then((f) => f?._id ?? null),
        blueprints: (
          await Promise.all(
            m.blueprints.map((b) =>
              db
                .db()
                .collection("blueprints")
                .findOne({ name: b })
                .then((bp) => bp?._id),
            ),
          )
        ).filter(Boolean),
      };
    }),
  );

  await db.db().collection("missions").insertMany(missionsDb);

  console.log("DONE");
}

updateFactions()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
