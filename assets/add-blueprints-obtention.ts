import { readFileSync } from "fs";
import path from "node:path";
import db from "@/lib/db";
import { Blueprint } from "@/types/crafting";

async function addBlueprintsObtention() {
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
      };
    };
    contracts: {
      id: string;
      missionType: string;
      title: string;
      factionGuid: string;
      blueprintRewards?: {
        blueprintPool: string;
        chance: number;
        poolName: string;
      }[];
    }[];
  } = JSON.parse(
    await readFileSync(path.join(__dirname, "missions.json"), "utf8"),
  );

  const blueprintsCursor = db.db().collection<Blueprint>("blueprints").find();

  while (await blueprintsCursor.hasNext()) {
    const blueprint = await blueprintsCursor.next();
    if (!blueprint) {
      continue;
    }

    // Compute list of ID of blueprintPools where the blueprint is found in.
    const poolsWithItem: string[] = Object.entries(raw.blueprintPools)
      .filter(([, pool]) =>
        pool.blueprints.some((b) => b.name === blueprint!.name),
      )
      .map(([poolId]) => poolId);

    // Compute list of contracts that have one of the pools as rewards
    const missions: { name: string; type: string; factionName?: string }[] =
      raw.contracts
        .filter((contract) =>
          contract.blueprintRewards?.some((reward) =>
            poolsWithItem.includes(reward.blueprintPool),
          ),
        )
        .map((contract) => ({
          name: contract.title,
          type: contract.missionType,
          factionName: raw.factions[contract.factionGuid]?.name,
        }));

    if (missions.length > 0) {
      const missionNames = missions.map(
        (m) => `- (${m.factionName}) ${m.name} (${m.type})`,
      );
      const uniqueMissionsNames = missionNames.filter(
        (name, index) => missionNames.indexOf(name) === index,
      );

      await db
        .db()
        .collection<Blueprint>("blueprints")
        .updateOne(
          { _id: blueprint._id },
          {
            $set: {
              obtention: uniqueMissionsNames.join("\n"),
            },
          },
        );
    }
  }

  console.log("DONE");
}

addBlueprintsObtention()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
